// Command ws_soak holds many authenticated /ws connections against a live stack
// (Traefik or ws-router), reconnects on please_reconnect / close, and reports
// sticky-slot + Redis soft/full/place occupancy.
//
// Hold soak (default — drain / reconnect evidence):
//
//	go build -o ../.tmp/ws_soak ./cmd/ws_soak
//	docker run --rm --network eip-core --env-file ../.env \
//	  -e REDIS_HOST=redis -e REDIS_PORT=6379 \
//	  -v "$PWD/../.tmp/ws_soak:/ws_soak:ro" --entrypoint /ws_soak alpine:3.20 \
//	  -ws-url ws://ws-router:8080/ws -clients 50 -duration 5m
//
// Limits soak (soft + hard pressure — sync low thresholds first):
//
//	# eip.config.yaml: target_clients: 20, client_cutoff: 40 → eip sync
//	docker run … /ws_soak -profile limits -expect-target 20 -expect-cutoff 40 -duration 2m
//
// Limits uses a fill corp (one place home) plus mixed account/corp/alliance keys
// to assert soft divert and full hard-skip via Redis place lookups.
//
// Host path (Traefik published): seed needs Redis reachability (same docker
// network, or tunnel). Example WS URL: ws://127.0.0.1/ws
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/wsplacement"

	"github.com/redis/go-redis/v9"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "ws_soak: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		profileName = flag.String("profile", "hold", "hold (endurance) | limits (soft+hard pressure)")
		wsURL       = flag.String("ws-url", "ws://ws-router:8080/ws", "WebSocket upgrade URL (query session id appended)")
		clients      = flag.Int("clients", 0, "concurrent /ws clients (0 = profile default)")
		accounts     = flag.Int("accounts", 0, "hold: distinct soak accounts (0 = 10)")
		duration     = flag.Duration("duration", 5*time.Minute, "how long to hold connections")
		ramp         = flag.Duration("ramp", 2*time.Second, "stagger first connects across this window")
		reportEvery  = flag.Duration("report-every", 15*time.Second, "progress line interval (0=off)")
		affinity     = flag.String("affinity", "", "hold: none|account|corp|alliance (empty = account). limits ignores (always mixed)")
		corpID       = flag.Int64("corp", 0, "hold: corporation id; limits: fill corp id (default 910001)")
		allianceID   = flag.Int64("alliance", 0, "hold: alliance id for affinity=alliance")
		reconnect    = flag.Bool("reconnect", true, "reconnect after please_reconnect / unexpected close (hold profile)")
		insecure     = flag.Bool("insecure", false, "skip TLS verify (local wss soak)")
		maxDrop      = flag.Float64("max-drop-rate", 1.0, "fail if unexpected_close/dial_ok exceeds this (1.0=never fail on drops)")
		seedOnly     = flag.Bool("seed-only", false, "seed Redis sessions and exit")
		noSeed       = flag.Bool("no-seed", false, "skip Redis session seed (sessions must already exist)")
		expectTarget = flag.Int("expect-target", 20, "limits: stack target_clients after eip sync")
		expectCutoff = flag.Int("expect-cutoff", 40, "limits: stack client_cutoff after eip sync")
		require503   = flag.Bool("require-503", false, "limits: fail unless HTTP 503 at_cutoff refuses (use direct websocket -ws-url)")
		flagWait     = flag.Duration("flag-wait", 90*time.Second, "limits: max wait for soft/full Redis keys after each phase")
		softDivertN  = flag.Int("soft-divert", 0, "limits: mixed-key clients after soft (0 = auto)")
		fullProbeN   = flag.Int("full-probe", 0, "limits: mixed-key clients after full (0 = auto)")
		minDivert    = flag.Float64("min-divert-ratio", 0.8, "limits: min fraction of soft-divert keys that must place off soft")
	)
	flag.Parse()

	prof, err := parseProfile(*profileName)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	rdb, err := connectRedis()
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	switch prof {
	case profileLimits:
		return runLimits(ctx, rdb, limitsRunArgs{
			wsURL:          *wsURL,
			clients:        *clients,
			duration:       *duration,
			ramp:           *ramp,
			reportEvery:    *reportEvery,
			fillCorpID:     *corpID,
			insecure:       *insecure,
			maxDrop:        *maxDrop,
			seedOnly:       *seedOnly,
			noSeed:         *noSeed,
			expectTarget:   *expectTarget,
			expectCutoff:   *expectCutoff,
			require503:     *require503,
			flagWait:       *flagWait,
			softDivert:     *softDivertN,
			fullProbes:     *fullProbeN,
			minDivertRatio: *minDivert,
		})
	default:
		return runHold(ctx, rdb, holdRunArgs{
			wsURL:       *wsURL,
			clients:     *clients,
			accounts:    *accounts,
			duration:    *duration,
			ramp:        *ramp,
			reportEvery: *reportEvery,
			affinity:    *affinity,
			corpID:      *corpID,
			allianceID:  *allianceID,
			reconnect:   *reconnect,
			insecure:    *insecure,
			maxDrop:     *maxDrop,
			seedOnly:    *seedOnly,
			noSeed:      *noSeed,
		})
	}
}

type holdRunArgs struct {
	wsURL, affinity           string
	clients, accounts         int
	duration, ramp, reportEvery time.Duration
	corpID, allianceID        int64
	reconnect, insecure       bool
	maxDrop                   float64
	seedOnly, noSeed          bool
}

func runHold(ctx context.Context, rdb *redis.Client, a holdRunArgs) error {
	clients := a.clients
	if clients < 1 {
		clients = 50
	}
	accounts := a.accounts
	if accounts < 1 {
		accounts = 10
	}
	aff := a.affinity
	if aff == "" {
		aff = string(affinityAccount)
	}
	mode, err := parseAffinityMode(aff)
	if err != nil {
		return err
	}
	ids, err := buildIdentities(clients, accounts, mode, a.corpID, a.allianceID)
	if err != nil {
		return err
	}
	if err := maybeSeed(ctx, rdb, ids, a.noSeed); err != nil {
		return err
	}
	if a.seedOnly {
		return nil
	}

	st := newStats()
	cfg := soakConfig{
		WSURL:       a.wsURL,
		Insecure:    a.insecure,
		Reconnect:   a.reconnect,
		ReadIdle:    30 * time.Second,
		DialTimeout: 10 * time.Second,
	}
	soakCtx, cancelSoak := context.WithTimeout(ctx, a.duration)
	defer cancelSoak()

	done := startWorkers(soakCtx, cfg, ids, st, a.ramp, a.reconnect)
	runReporter(soakCtx, done, st, a.reportEvery)
	waitSoak(soakCtx, done)
	cancelSoak()
	<-done

	return finishReport(rdb, st, a.maxDrop, nil)
}

type limitsRunArgs struct {
	wsURL                                string
	clients                              int
	duration, ramp, reportEvery, flagWait time.Duration
	fillCorpID                           int64
	insecure                             bool
	maxDrop                              float64
	seedOnly, noSeed                     bool
	expectTarget, expectCutoff           int
	softDivert, fullProbes               int
	minDivertRatio                       float64
	require503                           bool
}

func runLimits(ctx context.Context, rdb *redis.Client, a limitsRunArgs) error {
	plan, err := buildLimitsPlan(a.expectTarget, a.expectCutoff, a.clients, a.softDivert, a.fullProbes, a.fillCorpID, a.minDivertRatio)
	if err != nil {
		return err
	}
	ids, err := buildLimitsIdentities(plan.FillHolders, plan.SoftDivert, plan.FullProbes, plan.FillCorpID)
	if err != nil {
		return err
	}
	fillIDs := filterCohort(ids, cohortFill)
	softDivIDs := filterCohort(ids, cohortSoftDivert)
	fullProbeIDs := filterCohort(ids, cohortFullProbe)
	accN, corpN, allN := countAffinityKinds(append(append([]clientIdentity{}, softDivIDs...), fullProbeIDs...))
	fmt.Printf("limits plan: expect-target=%d expect-cutoff=%d fill=%d soft_divert=%d full_probe=%d fill_corp=%d min_divert_ratio=%.2f\n",
		plan.ExpectTarget, plan.ExpectCutoff, plan.FillHolders, plan.SoftDivert, plan.FullProbes, plan.FillCorpID, plan.MinDivertRatio)
	fmt.Printf("limits mixed keys (divert+probe): account=%d corp=%d alliance=%d\n", accN, corpN, allN)
	fmt.Printf("limits prerequisite: eip.config.yaml target_clients=%d client_cutoff=%d via eip sync; ≥2 websocket replicas for divert asserts\n",
		plan.ExpectTarget, plan.ExpectCutoff)

	if err := maybeSeed(ctx, rdb, ids, a.noSeed); err != nil {
		return err
	}
	if a.seedOnly {
		return nil
	}

	st := newStats()
	places := redisPlaceLookup{rdb: rdb}
	base := soakConfig{
		WSURL:       a.wsURL,
		Insecure:    a.insecure,
		ReadIdle:    30 * time.Second,
		DialTimeout: 10 * time.Second,
		PlaceRedis:  places,
	}
	soakCtx, cancelSoak := context.WithTimeout(ctx, a.duration)
	defer cancelSoak()

	targetN := plan.ExpectTarget
	if targetN > len(fillIDs) {
		targetN = len(fillIDs)
	}

	var wg sync.WaitGroup
	startBatch := func(batch []clientIdentity, reconnect bool, ramp time.Duration) {
		step := time.Duration(0)
		if len(batch) > 1 && ramp > 0 {
			step = ramp / time.Duration(len(batch))
		}
		cfg := base
		cfg.Reconnect = reconnect
		for i, id := range batch {
			wg.Add(1)
			go func(delay time.Duration, ident clientIdentity) {
				defer wg.Done()
				if delay > 0 {
					select {
					case <-soakCtx.Done():
						return
					case <-time.After(delay):
					}
				}
				runWorker(soakCtx, cfg, ident, st)
			}(time.Duration(i)*step, id)
		}
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	runReporter(soakCtx, done, st, a.reportEvery)

	var seenSoft, seenFull bool
	var softSlots, fullSlots []string

	// Phase 1: fill shared corp up to soft.
	fmt.Printf("limits phase1: fill %d (soft at %d, corp=%d)\n", targetN, plan.ExpectTarget, plan.FillCorpID)
	startBatch(fillIDs[:targetN], plan.ReconnectHolders, a.ramp)
	if err := waitLive(soakCtx, st, int64(targetN), 100*time.Millisecond); err != nil {
		cancelSoak()
		<-done
		return err
	}
	softCtx, softCancel := context.WithTimeout(soakCtx, a.flagWait)
	err = waitSoftFull(softCtx, rdb, true, false, 500*time.Millisecond, &seenSoft, &seenFull)
	softCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(rdb, st, a.maxDrop, nil)
		return fmt.Errorf("phase1 soft: %w", err)
	}
	if softKeys, _, perr := probeSoftFull(context.Background(), rdb); perr == nil {
		softSlots = slotsFromFlagKeys(softKeys, wsplacement.SoftPrefix)
	}
	fmt.Printf("limits phase1: soft observed slots=%v live=%d\n", softSlots, st.live.Load())

	// Phase 2: mixed new keys while soft — must prefer non-soft.
	if len(softDivIDs) > 0 {
		fmt.Printf("limits phase2: soft-divert %d mixed keys\n", len(softDivIDs))
		startBatch(softDivIDs, plan.ReconnectProbes, a.ramp)
		liveCtx, liveCancel := context.WithTimeout(soakCtx, a.flagWait)
		_ = waitLive(liveCtx, st, int64(targetN+len(softDivIDs)), 100*time.Millisecond)
		liveCancel()
		// Brief settle for Redis place writes.
		select {
		case <-soakCtx.Done():
		case <-time.After(500 * time.Millisecond):
		}
		on, off, total := countOnOff(st.cohortSlotCounts(cohortSoftDivert), softSlots)
		fmt.Printf("limits phase2: soft-divert place off_soft=%d on_soft=%d total=%d soft_slots=%v slots=%s\n",
			off, on, total, softSlots, formatCounts(st.cohortSlotCounts(cohortSoftDivert)))
	}

	// Phase 3: remaining fill to hard cutoff.
	restFill := fillIDs[targetN:]
	if len(restFill) > 0 {
		fmt.Printf("limits phase3: fill %d more (full at %d)\n", len(restFill), plan.ExpectCutoff)
		startBatch(restFill, plan.ReconnectHolders, a.ramp)
	}
	liveCtx, liveCancel := context.WithTimeout(soakCtx, a.flagWait)
	_ = waitLive(liveCtx, st, int64(plan.ExpectCutoff), 100*time.Millisecond)
	liveCancel()
	fullCtx, fullCancel := context.WithTimeout(soakCtx, a.flagWait)
	err = waitSoftFull(fullCtx, rdb, false, true, 500*time.Millisecond, &seenSoft, &seenFull)
	fullCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(rdb, st, a.maxDrop, nil)
		return fmt.Errorf("phase3 full: %w", err)
	}
	if softKeys, fullKeys, perr := probeSoftFull(context.Background(), rdb); perr == nil {
		softSlots = slotsFromFlagKeys(softKeys, wsplacement.SoftPrefix)
		fullSlots = slotsFromFlagKeys(fullKeys, wsplacement.FullPrefix)
	}
	fmt.Printf("limits phase3: full observed slots=%v live=%d\n", fullSlots, st.live.Load())

	// Phase 4: mixed keys after full — must not place on full slot.
	if len(fullProbeIDs) > 0 {
		fmt.Printf("limits phase4: full-probe %d mixed keys\n", len(fullProbeIDs))
		startBatch(fullProbeIDs, plan.ReconnectProbes, a.ramp/2)
		probeLive := int64(plan.ExpectCutoff + len(softDivIDs) + len(fullProbeIDs))
		pCtx, pCancel := context.WithTimeout(soakCtx, a.flagWait)
		_ = waitLive(pCtx, st, probeLive, 100*time.Millisecond)
		pCancel()
		select {
		case <-soakCtx.Done():
		case <-time.After(500 * time.Millisecond):
		}
		on, off, total := countOnOff(st.cohortSlotCounts(cohortFullProbe), fullSlots)
		fmt.Printf("limits phase4: full-probe place off_full=%d on_full=%d total=%d full_slots=%v slots=%s\n",
			off, on, total, fullSlots, formatCounts(st.cohortSlotCounts(cohortFullProbe)))
	}

	waitSoak(soakCtx, done)
	cancelSoak()
	<-done

	soft, full, perr := probeSoftFull(context.Background(), rdb)
	if perr == nil {
		if len(soft) > 0 {
			seenSoft = true
			softSlots = slotsFromFlagKeys(soft, wsplacement.SoftPrefix)
		}
		if len(full) > 0 {
			seenFull = true
			fullSlots = slotsFromFlagKeys(full, wsplacement.FullPrefix)
		}
	}
	softOn, softOff, softTotal := countOnOff(st.cohortSlotCounts(cohortSoftDivert), softSlots)
	fullOn, fullOff, fullTotal := countOnOff(st.cohortSlotCounts(cohortFullProbe), fullSlots)
	ev := limitsEvidence{
		SoftSeen:          seenSoft,
		FullSeen:          seenFull,
		Refuse503:         st.refuseStatus(http.StatusServiceUnavailable),
		ConnectedOK:       st.ConnectedOK.Load(),
		ExpectTarget:      plan.ExpectTarget,
		ExpectCutoff:      plan.ExpectCutoff,
		Require503:        a.require503,
		SoftSlots:         softSlots,
		FullSlots:         fullSlots,
		SoftDivertTotal:   softTotal,
		SoftDivertOffSoft: softOff,
		SoftDivertOnSoft:  softOn,
		FullProbeTotal:    fullTotal,
		FullProbeOffFull:  fullOff,
		FullProbeOnFull:   fullOn,
		MinDivertRatio:    plan.MinDivertRatio,
		// Skip only when we recorded no divert placements (lookup failed); ≥2 replicas required for a pass.
		SkipDivertAssert: softTotal == 0,
		AffinityAccount:  accN,
		AffinityCorp:     corpN,
		AffinityAlliance: allN,
	}
	if err := finishReport(rdb, st, a.maxDrop, &ev); err != nil {
		return err
	}
	return ev.assert()
}

func maybeSeed(ctx context.Context, rdb *redis.Client, ids []clientIdentity, noSeed bool) error {
	if noSeed {
		return nil
	}
	seedCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	if err := seedSessions(seedCtx, rdb, ids); err != nil {
		return err
	}
	fmt.Printf("seeded %d sessions across %d accounts\n", len(ids), uniqueAccounts(ids))
	return nil
}

func startWorkers(ctx context.Context, cfg soakConfig, ids []clientIdentity, st *stats, ramp time.Duration, reconnect bool) <-chan struct{} {
	cfg.Reconnect = reconnect
	var wg sync.WaitGroup
	step := time.Duration(0)
	if len(ids) > 1 && ramp > 0 {
		step = ramp / time.Duration(len(ids))
	}
	for i, id := range ids {
		wg.Add(1)
		go func(delay time.Duration, ident clientIdentity) {
			defer wg.Done()
			if delay > 0 {
				select {
				case <-ctx.Done():
					return
				case <-time.After(delay):
				}
			}
			runWorker(ctx, cfg, ident, st)
		}(time.Duration(i)*step, id)
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	return done
}

func runReporter(ctx context.Context, done <-chan struct{}, st *stats, every time.Duration) {
	if every <= 0 {
		return
	}
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-t.C:
				fmt.Println(st.snapshotLine("progress"))
			}
		}
	}()
}

func waitSoak(ctx context.Context, done <-chan struct{}) {
	select {
	case <-ctx.Done():
	case <-done:
	}
}

func finishReport(rdb *redis.Client, st *stats, maxDrop float64, limits *limitsEvidence) error {
	soft, full, err := probeSoftFull(context.Background(), rdb)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warn: soft/full probe: %v\n", err)
	}
	place, err := probePlacementCounts(context.Background(), rdb)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warn: place probe: %v\n", err)
	}
	fmt.Print(st.finalReport(soft, full, place))
	if limits != nil {
		fmt.Printf("limits_evidence: soft_seen=%v full_seen=%v refuse_503=%d require_503=%v\n",
			limits.SoftSeen, limits.FullSeen, limits.Refuse503, limits.Require503)
		fmt.Printf("limits_divert: soft_slots=%v soft_divert off/on/total=%d/%d/%d full_slots=%v full_probe off/on/total=%d/%d/%d mixed_keys account/corp/alliance=%d/%d/%d\n",
			limits.SoftSlots, limits.SoftDivertOffSoft, limits.SoftDivertOnSoft, limits.SoftDivertTotal,
			limits.FullSlots, limits.FullProbeOffFull, limits.FullProbeOnFull, limits.FullProbeTotal,
			limits.AffinityAccount, limits.AffinityCorp, limits.AffinityAlliance)
	}
	if st.ConnectedOK.Load() == 0 {
		return fmt.Errorf("no successful connected frames (check -ws-url, Redis seed, stack Ready)")
	}
	if st.dropRate() > maxDrop {
		return fmt.Errorf("drop rate %.3f exceeds -max-drop-rate %.3f", st.dropRate(), maxDrop)
	}
	return nil
}

func connectRedis() (*redis.Client, error) {
	redisURL, err := config.RedisURL()
	if err != nil {
		return nil, err
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	opts.DialTimeout = 5 * time.Second
	opts.ReadTimeout = 10 * time.Second
	opts.WriteTimeout = 5 * time.Second
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return client, nil
}

func uniqueAccounts(ids []clientIdentity) int {
	seen := map[string]struct{}{}
	for _, id := range ids {
		seen[id.AccountID] = struct{}{}
	}
	return len(seen)
}
