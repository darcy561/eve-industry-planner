package soaklib

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"eve-industry-planner/shared/wsplacement"
)

const (
	defaultPublishGateReady    = 8
	defaultPublishGateSolo     = 1
	defaultPublishGateCorp     = 1
	defaultPublishGateAlliance = 1
)

// FanoutPublisherOptions configures the rate-limited live-registry publisher loop.
type FanoutPublisherOptions struct {
	Reg   *liveRegistry
	Track *deliveryTracker
	Pub   Publisher

	// Messages is a soft progress floor when UntilDone (0 = none). Without UntilDone, 0 defaults to 600 and is required.
	Messages int
	Rate     float64
	Seed     int64
	// UntilDone keeps publishing until ctx ends; duration cancel is success (Messages is not a hard fail).
	UntilDone bool

	MinReady    int // publish gate: ready accounts
	MinSolo     int
	MinCorp     int // distinct ready corps
	MinAlliance int // distinct ready alliances
	GateWait    time.Duration
}

type fanoutPublisherStats struct {
	Published int
	Skipped   int
	GatedAt   time.Time
}

const (
	fanoutPublishTimeout  = 15 * time.Second
	fanoutSnapshotRefresh = 100 * time.Millisecond
)

func (o FanoutPublisherOptions) withDefaults() FanoutPublisherOptions {
	out := o
	if out.Messages < 1 && !out.UntilDone {
		out.Messages = 600
	}
	if out.Rate <= 0 {
		out.Rate = 100
	}
	if out.MinReady <= 0 {
		out.MinReady = defaultPublishGateReady
	}
	if out.MinSolo <= 0 {
		out.MinSolo = defaultPublishGateSolo
	}
	if out.MinCorp <= 0 {
		out.MinCorp = defaultPublishGateCorp
	}
	if out.MinAlliance <= 0 {
		out.MinAlliance = defaultPublishGateAlliance
	}
	if out.GateWait <= 0 {
		out.GateWait = 90 * time.Second
	}
	return out
}

func publishGateOK(snap liveSnapshot, opts FanoutPublisherOptions) bool {
	if snap.ReadyCount < opts.MinReady {
		return false
	}
	if len(snap.ReadySolos) < opts.MinSolo {
		return false
	}
	if len(snap.ReadyByCorp) < opts.MinCorp {
		return false
	}
	if len(snap.ReadyByAll) < opts.MinAlliance {
		return false
	}
	return true
}

func waitPublishGate(ctx context.Context, reg *liveRegistry, opts FanoutPublisherOptions) error {
	deadline := time.Now().Add(opts.GateWait)
	for {
		snap := reg.Snapshot()
		if publishGateOK(snap, opts) {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("publish gate timeout: ready=%d solo=%d corps=%d alliances=%d (want ready>=%d solo>=%d corp>=%d all>=%d)",
				snap.ReadyCount, len(snap.ReadySolos), len(snap.ReadyByCorp), len(snap.ReadyByAll),
				opts.MinReady, opts.MinSolo, opts.MinCorp, opts.MinAlliance)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("publish gate cancelled: %w", ctx.Err())
		case <-time.After(50 * time.Millisecond):
		}
	}
}

// runFanoutPublisher waits for the publish gate, then rate-limits stamped pubs from the live registry.
// UntilDone: stop when ctx ends (success); Messages is only a soft floor for the supervisor to warn on.
// Publish uses a short detached timeout so phase deadline does not abort mid-NATS publish.
func runFanoutPublisher(ctx context.Context, opts FanoutPublisherOptions) (*fanoutPublisherStats, error) {
	opts = opts.withDefaults()
	if opts.Reg == nil || opts.Track == nil || opts.Pub == nil {
		return nil, fmt.Errorf("fanout publisher: Reg, Track, and Pub are required")
	}
	out := &fanoutPublisherStats{}
	gateStart := time.Now()
	if err := waitPublishGate(ctx, opts.Reg, opts); err != nil {
		return out, err
	}
	out.GatedAt = time.Now()
	snap0 := opts.Reg.Snapshot()
	fmt.Printf("fanout publisher: gate open after %s ready=%d solo=%d corps=%d alliances=%d — publishing ~%.0f/s until duration ends\n",
		out.GatedAt.Sub(gateStart).Truncate(time.Millisecond),
		snap0.ReadyCount, len(snap0.ReadySolos), len(snap0.ReadyByCorp), len(snap0.ReadyByAll),
		opts.Rate)

	rng := newTenantRNG(opts.Seed ^ 0x905eed) // distinct stream from tenantGen
	interval := max(time.Duration(float64(time.Second)/opts.Rate), time.Millisecond)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	seq := 0
	var snap liveSnapshot
	var snapAt time.Time
	for {
		if !opts.UntilDone && out.Published >= opts.Messages {
			return out, nil
		}
		select {
		case <-ctx.Done():
			if opts.UntilDone {
				return out, nil
			}
			return out, fmt.Errorf("fanout publisher interrupted after %d pubs: %w", out.Published, ctx.Err())
		case <-ticker.C:
			if ctx.Err() != nil {
				if opts.UntilDone {
					return out, nil
				}
				return out, fmt.Errorf("fanout publisher interrupted after %d pubs: %w", out.Published, ctx.Err())
			}
		}
		now := time.Now()
		if snapAt.IsZero() || now.Sub(snapAt) >= fanoutSnapshotRefresh {
			snap = opts.Reg.Snapshot()
			snapAt = now
		}
		job, ok := pickLiveJob(rng, snap, seq)
		seq++
		if !ok {
			out.Skipped++
			continue
		}
		expects := resolveJobExpectsFromSnap(snap, job)
		if len(expects) == 0 {
			out.Skipped++
			continue
		}
		msg := docUpdateFromJob(job)
		msg.SentAt = time.Now()
		// Detach from phase deadline so a clean duration stop does not fail Publish.
		pubCtx, pubCancel := context.WithTimeout(context.WithoutCancel(ctx), fanoutPublishTimeout)
		err := opts.Pub.Publish(pubCtx, msg)
		pubCancel()
		if err != nil {
			if opts.UntilDone && (ctx.Err() != nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)) {
				return out, nil
			}
			return out, fmt.Errorf("fanout publish %s: %w", job.DocID, err)
		}
		opts.Track.TrackPub(job.DocID, job.Kind, expects)
		out.Published++
	}
}

var livePublishKinds = []fanoutMsgKind{
	fanoutMsgAccount,
	fanoutMsgCorpFull,
	fanoutMsgCorpDownAccount,
	fanoutMsgAllianceFull,
	fanoutMsgAllianceDownCorp,
	fanoutMsgAllianceDownAccount,
}

func pickLiveJob(rng *rand.Rand, snap liveSnapshot, seq int) (fanoutJob, bool) {
	if snap.ReadyCount == 0 {
		return fanoutJob{}, false
	}
	// Rotate preferred kind; fall back across kinds if the live mix cannot satisfy it.
	start := seq % len(livePublishKinds)
	for off := 0; off < len(livePublishKinds); off++ {
		kind := livePublishKinds[(start+off)%len(livePublishKinds)]
		coll := fanoutCollections[seq%len(fanoutCollections)]
		docID := fmt.Sprintf("soak-fanout-%s-%s-%d", kind, coll, seq+1)
		job, ok := buildLiveJob(rng, snap, kind, docID, coll, seq)
		if ok {
			return job, true
		}
	}
	return fanoutJob{}, false
}

func buildLiveJob(rng *rand.Rand, snap liveSnapshot, kind fanoutMsgKind, docID, collection string, seq int) (fanoutJob, bool) {
	switch kind {
	case fanoutMsgAccount:
		pool := snap.ReadyAccounts
		if len(snap.ReadySolos) > 0 && seq%3 == 0 {
			pool = snap.ReadySolos
		}
		if len(pool) == 0 {
			return fanoutJob{}, false
		}
		acct := pool[rng.IntN(len(pool))]
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyAccount(acct),
			AccountID:      acct,
			ExpectAccounts: []string{acct},
			Expect:         1,
		}, true

	case fanoutMsgCorpFull:
		corpID, members, ok := pickReadyCorp(rng, snap, 0)
		if !ok {
			return fanoutJob{}, false
		}
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyCorporation(CorporationRef(corpID)),
			CorporationRef: CorporationRef(corpID),
			CorpID:         corpID,
			ExpectAccounts: append([]string{}, members...),
			Expect:         len(members),
		}, true

	case fanoutMsgCorpDownAccount:
		corpID, members, ok := pickReadyCorp(rng, snap, 1)
		if !ok {
			return fanoutJob{}, false
		}
		n := max(len(members)/2, 1)
		if n > len(members) {
			n = len(members)
		}
		start := seq % max(len(members)-n+1, 1)
		scope := append([]string{}, members[start:start+n]...)
		return fanoutJob{
			Kind:            kind,
			DocID:           docID,
			Collection:      collection,
			TenantString:    wsplacement.TenantKeyCorporation(CorporationRef(corpID)),
			CorporationRef:  CorporationRef(corpID),
			CorpID:          corpID,
			ScopeAccountIDs: scope,
			ExpectAccounts:  append([]string{}, scope...),
			Expect:          len(scope),
		}, true

	case fanoutMsgAllianceFull:
		allID, members, ok := pickReadyAlliance(rng, snap)
		if !ok {
			return fanoutJob{}, false
		}
		return fanoutJob{
			Kind:           kind,
			DocID:          docID,
			Collection:     collection,
			TenantString:   wsplacement.TenantKeyAlliance(AllianceRef(allID)),
			AllianceRef:    AllianceRef(allID),
			AllianceID:     allID,
			ExpectAccounts: append([]string{}, members...),
			Expect:         len(members),
		}, true

	case fanoutMsgAllianceDownCorp:
		allID, corpID, members, ok := pickReadyAllianceCorp(rng, snap)
		if !ok {
			return fanoutJob{}, false
		}
		return fanoutJob{
			Kind:                 kind,
			DocID:                docID,
			Collection:           collection,
			TenantString:         wsplacement.TenantKeyAlliance(AllianceRef(allID)),
			AllianceRef:          AllianceRef(allID),
			AllianceID:           allID,
			ScopeCorporationRefs: []string{CorporationRef(corpID)},
			ScopeCorpIDs:         []int64{corpID},
			ExpectAccounts:       append([]string{}, members...),
			Expect:               len(members),
		}, true

	case fanoutMsgAllianceDownAccount:
		allID, members, ok := pickReadyAlliance(rng, snap)
		if !ok || len(members) == 0 {
			return fanoutJob{}, false
		}
		n := min(2, len(members))
		scope := make([]string, 0, n)
		perm := rng.Perm(len(members))
		for i := 0; i < n; i++ {
			scope = append(scope, members[perm[i]])
		}
		return fanoutJob{
			Kind:            kind,
			DocID:           docID,
			Collection:      collection,
			TenantString:    wsplacement.TenantKeyAlliance(AllianceRef(allID)),
			AllianceRef:     AllianceRef(allID),
			AllianceID:      allID,
			ScopeAccountIDs: scope,
			ExpectAccounts:  append([]string{}, scope...),
			Expect:          len(scope),
		}, true
	}
	return fanoutJob{}, false
}

func pickReadyCorp(rng *rand.Rand, snap liveSnapshot, minMembers int) (corpID int64, members []string, ok bool) {
	var ids []int64
	for id, m := range snap.ReadyByCorp {
		if len(m) >= minMembers && len(m) > 0 {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return 0, nil, false
	}
	corpID = ids[rng.IntN(len(ids))]
	return corpID, snap.ReadyByCorp[corpID], true
}

func pickReadyAlliance(rng *rand.Rand, snap liveSnapshot) (allianceID int64, members []string, ok bool) {
	var ids []int64
	for id, m := range snap.ReadyByAll {
		if len(m) > 0 {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return 0, nil, false
	}
	allianceID = ids[rng.IntN(len(ids))]
	return allianceID, snap.ReadyByAll[allianceID], true
}

func pickReadyAllianceCorp(rng *rand.Rand, snap liveSnapshot) (allianceID, corpID int64, members []string, ok bool) {
	type pair struct {
		all, corp int64
	}
	var pairs []pair
	for corp, all := range snap.CorpAlliance {
		if all == 0 {
			continue
		}
		if m := snap.ReadyByCorp[corp]; len(m) > 0 {
			pairs = append(pairs, pair{all: all, corp: corp})
		}
	}
	if len(pairs) == 0 {
		return 0, 0, nil, false
	}
	p := pairs[rng.IntN(len(pairs))]
	return p.all, p.corp, snap.ReadyByCorp[p.corp], true
}
