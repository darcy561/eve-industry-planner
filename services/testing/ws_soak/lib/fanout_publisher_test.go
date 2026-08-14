package soaklib

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestPickLiveJobKinds(t *testing.T) {
	snap := liveSnapshot{
		ReadyAccounts: []string{"s1", "m1", "m2", "m3"},
		ReadySolos:    []string{"s1"},
		ReadyByCorp: map[int64][]string{
			10: {"m1", "m2"},
			11: {"m3"},
		},
		ReadyByAll: map[int64][]string{
			99: {"m1", "m2", "m3"},
		},
		CorpAlliance: map[int64]int64{
			10: 99,
			11: 99,
		},
		ReadyCount: 4,
	}
	rng := newTenantRNG(1)
	seen := map[fanoutMsgKind]bool{}
	for i := 0; i < 40; i++ {
		job, ok := pickLiveJob(rng, snap, i)
		if !ok {
			t.Fatalf("seq=%d no job", i)
		}
		seen[job.Kind] = true
		if job.DocID == "" || job.Collection == "" {
			t.Fatalf("incomplete job %#v", job)
		}
		if len(job.ExpectAccounts) == 0 {
			t.Fatalf("empty expects %#v", job)
		}
	}
	for _, k := range livePublishKinds {
		if !seen[k] {
			t.Fatalf("missing kind %s in %v", k, seen)
		}
	}
}

func TestPublishGate(t *testing.T) {
	reg := newLiveRegistry(time.Millisecond)
	opts := FanoutPublisherOptions{
		MinReady: 3, MinSolo: 1, MinCorp: 1, MinAlliance: 1, GateWait: 200 * time.Millisecond,
	}

	if err := waitPublishGate(context.Background(), reg, opts); err == nil {
		t.Fatal("expected gate timeout on empty registry")
	}

	reg.MarkLive(clientIdentity{AccountID: "s1"})
	reg.MarkLive(clientIdentity{AccountID: "m1", CorpID: 1, AllianceID: 2})
	reg.MarkLive(clientIdentity{AccountID: "m2", CorpID: 1, AllianceID: 2})
	reg.ScheduleReady("s1")
	reg.ScheduleReady("m1")
	reg.ScheduleReady("m2")
	waitReady(context.Background(), reg, 3, time.Second)

	opts.GateWait = time.Second
	if err := waitPublishGate(context.Background(), reg, opts); err != nil {
		t.Fatal(err)
	}
}

type countingPublisher struct {
	n atomic.Int64
}

func (p *countingPublisher) Publish(context.Context, DocUpdate) error {
	p.n.Add(1)
	return nil
}
func (p *countingPublisher) Close() error { return nil }

func TestRunFanoutPublisherStub(t *testing.T) {
	reg := newLiveRegistry(time.Millisecond)
	for _, id := range []clientIdentity{
		{AccountID: "s1"},
		{AccountID: "m1", CorpID: 5, AllianceID: 9},
		{AccountID: "m2", CorpID: 5, AllianceID: 9},
		{AccountID: "m3", CorpID: 6, AllianceID: 9},
	} {
		reg.MarkLive(id)
		reg.ScheduleReady(id.AccountID)
	}
	waitReady(context.Background(), reg, 4, time.Second)

	track := newDeliveryTracker(64)
	track.Start()
	defer track.Close()

	pub := &countingPublisher{}
	stats, err := runFanoutPublisher(context.Background(), FanoutPublisherOptions{
		Reg:         reg,
		Track:       track,
		Pub:         pub,
		Messages:    12,
		Rate:        1000,
		Seed:        3,
		MinReady:    3,
		MinSolo:     1,
		MinCorp:     1,
		MinAlliance: 1,
		GateWait:    time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	if stats.Published != 12 || pub.n.Load() != 12 {
		t.Fatalf("published=%d pubN=%d skipped=%d", stats.Published, pub.n.Load(), stats.Skipped)
	}
	if track.Pubs.Load() != 12 {
		t.Fatalf("track pubs=%d", track.Pubs.Load())
	}
}

func TestFanoutPublisherUntilDoneStopsOnCancel(t *testing.T) {
	reg := newLiveRegistry(time.Millisecond)
	for _, id := range []clientIdentity{
		{AccountID: "solo-u"},
		{AccountID: "c1", CorpID: 1},
		{AccountID: "c2", CorpID: 1, AllianceID: 2},
		{AccountID: "c3", CorpID: 1, AllianceID: 2},
	} {
		reg.MarkLive(id)
		reg.ScheduleReady(id.AccountID)
	}
	waitReady(context.Background(), reg, 4, time.Second)

	track := newDeliveryTracker(64)
	track.Start()
	defer track.Close()

	ctx, cancel := context.WithCancel(context.Background())
	pub := &countingPublisher{}
	type result struct {
		stats *fanoutPublisherStats
		err   error
	}
	done := make(chan result, 1)
	go func() {
		stats, err := runFanoutPublisher(ctx, FanoutPublisherOptions{
			Reg:         reg,
			Track:       track,
			Pub:         pub,
			Messages:    100000, // unreachable soft floor
			Rate:        200,
			Seed:        9,
			UntilDone:   true,
			MinReady:    3,
			MinSolo:     1,
			MinCorp:     1,
			MinAlliance: 1,
			GateWait:    time.Second,
		})
		done <- result{stats, err}
	}()
	time.Sleep(80 * time.Millisecond)
	cancel()
	pr := <-done
	if pr.err != nil {
		t.Fatalf("UntilDone cancel should succeed: %v", pr.err)
	}
	if pr.stats.Published < 1 {
		t.Fatalf("expected some pubs before cancel, got %d", pr.stats.Published)
	}
	if pr.stats.Published >= 100000 {
		t.Fatal("should stop on cancel before soft floor")
	}
}

func TestFanoutSupervisorNoPublisherWire(t *testing.T) {
	// Integration-style: gen + churn + stub publisher supervisor pieces without WS.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	reg := newLiveRegistry(5 * time.Millisecond)
	track := newDeliveryTracker(128)
	track.Start()
	defer track.Close()

	genCh, _, genErr := StartTenantGen(ctx, TenantGenOptions{
		Clients:   30,
		Seed:      21,
		EmitEvery: time.Microsecond,
		NoSeed:    true,
		BufSize:   8,
	})

	churnStats, churnErr, _ := StartChurnPool(ctx, ChurnPoolOptions{
		GenCh:        genCh,
		LiveRatio:    0.7,
		TickEvery:    5 * time.Millisecond,
		LeaveTimeout: time.Second,
		Seed:         21,
		Pending:      track.HasPendingAccount,
		RunIdentity: func(wctx context.Context, id clientIdentity) {
			reg.MarkLive(id)
			reg.ScheduleReady(id.AccountID)
			<-wctx.Done()
			reg.Unregister(id.AccountID)
		},
	})

	pub := &countingPublisher{}
	pubStats, err := runFanoutPublisher(ctx, FanoutPublisherOptions{
		Reg:         reg,
		Track:       track,
		Pub:         pub,
		Messages:    20,
		Rate:        500,
		Seed:        21,
		MinReady:    6,
		MinSolo:     1,
		MinCorp:     1,
		MinAlliance: 1,
		GateWait:    3 * time.Second,
	})
	cancel()
	<-churnErr
	<-genErr
	if err != nil {
		t.Fatal(err)
	}
	if pubStats.Published != 20 {
		t.Fatalf("pubs=%d churn=%s", pubStats.Published, churnStats.summary())
	}
}
