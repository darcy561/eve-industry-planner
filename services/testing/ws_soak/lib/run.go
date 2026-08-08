package soaklib

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"eve-industry-planner/shared/core/config"

	"github.com/redis/go-redis/v9"
)

// Run connects Redis + NATS placement watch and executes cfg.Profile.
func Run(ctx context.Context, cfg Config) error {
	cfg = cfg.withDefaults()
	if cfg.Profile == "" {
		cfg.Profile = ProfileHold
	}
	if _, err := ParseProfile(string(cfg.Profile)); err != nil {
		return err
	}
	switch cfg.Publish {
	case PublishNone, "", PublishJetStream, PublishMongo:
	default:
		return fmt.Errorf("unknown publish mode %q", cfg.Publish)
	}

	rdb, err := connectRedis()
	if err != nil {
		return err
	}
	defer func() { _ = rdb.Close() }()

	nc, err := connectNATS()
	if err != nil {
		return err
	}
	defer nc.Close()
	watch, err := startPlacementWatch(nc)
	if err != nil {
		return err
	}

	switch cfg.Profile {
	case ProfileFanout:
		return runFanout(ctx, rdb, watch, cfg)
	case ProfileLimits:
		return runLimits(ctx, rdb, watch, limitsRunArgs{
			wsURL:          cfg.WSURL,
			clients:        cfg.Clients,
			duration:       cfg.Duration,
			ramp:           cfg.Ramp,
			reportEvery:    cfg.ReportEvery,
			fillCorpID:     cfg.CorpID,
			insecure:       cfg.Insecure,
			maxDrop:        cfg.MaxDrop,
			seedOnly:       cfg.SeedOnly,
			noSeed:         cfg.NoSeed,
			expectTarget:   cfg.ExpectTarget,
			expectCutoff:   cfg.ExpectCutoff,
			require503:     cfg.Require503,
			flagWait:       cfg.FlagWait,
			softDivert:     cfg.SoftDivert,
			fullProbes:     cfg.FullProbes,
			minDivertRatio: cfg.MinDivertRatio,
			requireColoc:   cfg.RequireColoc,
			readIdle:       cfg.ReadIdle,
		})
	case ProfilePressure:
		return runPressure(ctx, rdb, watch, pressureRunArgs{
			wsURL:          cfg.WSURL,
			clients:        cfg.Clients,
			duration:       cfg.Duration,
			ramp:           cfg.Ramp,
			reportEvery:    cfg.ReportEvery,
			fillCorpID:     cfg.CorpID,
			insecure:       cfg.Insecure,
			maxDrop:        cfg.MaxDrop,
			seedOnly:       cfg.SeedOnly,
			noSeed:         cfg.NoSeed,
			expectTarget:   cfg.ExpectTarget,
			expectCutoff:   cfg.ExpectCutoff,
			require503:     cfg.Require503,
			flagWait:       cfg.FlagWait,
			softDivert:     cfg.SoftDivert,
			fullProbes:     cfg.FullProbes,
			minDivertRatio: cfg.MinDivertRatio,
			requireColoc:   cfg.RequireColoc,
			groups:         cfg.Groups,
			groupSize:      cfg.GroupSize,
			readIdle:       cfg.ReadIdle,
		})
	case ProfileHold:
		return runHold(ctx, rdb, watch, holdRunArgs{
			wsURL:        cfg.WSURL,
			clients:      cfg.Clients,
			accounts:     cfg.Accounts,
			duration:     cfg.Duration,
			ramp:         cfg.Ramp,
			reportEvery:  cfg.ReportEvery,
			affinity:     cfg.Affinity,
			corpID:       cfg.CorpID,
			allianceID:   cfg.AllianceID,
			reconnect:    cfg.Reconnect,
			insecure:     cfg.Insecure,
			maxDrop:      cfg.MaxDrop,
			seedOnly:     cfg.SeedOnly,
			noSeed:       cfg.NoSeed,
			requireColoc: cfg.RequireColoc,
			readIdle:     cfg.ReadIdle,
		})
	default:
		return fmt.Errorf("unsupported profile %q", cfg.Profile)
	}
}

type holdRunArgs struct {
	wsURL, affinity             string
	clients, accounts           int
	duration, ramp, reportEvery time.Duration
	corpID, allianceID          int64
	reconnect, insecure         bool
	maxDrop                     float64
	seedOnly, noSeed            bool
	requireColoc                bool
	readIdle                    time.Duration
}

func runHold(ctx context.Context, rdb *redis.Client, watch *placementWatcher, a holdRunArgs) error {
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
		ReadIdle:    a.readIdle,
		DialTimeout: 10 * time.Second,
	}
	soakCtx, cancelSoak := context.WithTimeout(ctx, a.duration)
	defer cancelSoak()

	if a.requireColoc && mode != affinityNone {
		fmt.Printf("hold: require-coloc=true affinity=%s (fail if shared keys split backends)\n", mode)
	}

	done := startWorkers(soakCtx, cfg, ids, st, a.ramp, a.reconnect)
	runReporter(soakCtx, done, st, a.reportEvery)
	waitSoak(soakCtx, done)
	cancelSoak()
	<-done

	if err := finishReport(watch, st, a.maxDrop, nil); err != nil {
		return err
	}
	if a.requireColoc {
		homes := st.affinityHomeSets()
		fmt.Printf("coloc: affinities=%d splits=%d homes=%s\n",
			len(homes), len(findColocSplits(homes)), formatAffinityHomes(homes))
		if err := assertNoColocSplits(homes); err != nil {
			return err
		}
	}
	return nil
}

type limitsRunArgs struct {
	wsURL                                 string
	clients                               int
	duration, ramp, reportEvery, flagWait time.Duration
	fillCorpID                            int64
	insecure                              bool
	maxDrop                               float64
	seedOnly, noSeed                      bool
	expectTarget, expectCutoff            int
	softDivert, fullProbes                int
	minDivertRatio                        float64
	require503                            bool
	requireColoc                          bool
	readIdle                              time.Duration
}

func runLimits(ctx context.Context, rdb *redis.Client, watch *placementWatcher, a limitsRunArgs) error {
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
	base := soakConfig{
		WSURL:       a.wsURL,
		Insecure:    a.insecure,
		ReadIdle:    a.readIdle,
		DialTimeout: 10 * time.Second,
	}
	soakCtx, cancelSoak := context.WithTimeout(ctx, a.duration)
	defer cancelSoak()

	targetN := min(plan.ExpectTarget, len(fillIDs))

	var wg sync.WaitGroup
	startBatch := newBatchStarter(soakCtx, &wg, base, st)

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
	err = waitSoftFull(softCtx, watch, true, false, 500*time.Millisecond, &seenSoft, &seenFull)
	softCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(watch, st, a.maxDrop, nil)
		return fmt.Errorf("phase1 soft: %w", err)
	}
	softSlots = uniqueSorted(watch.softIDs())
	fmt.Printf("limits phase1: soft observed containers=%v live=%d\n", softSlots, st.live.Load())

	// Phase 2: mixed new keys while soft — must prefer non-soft.
	if len(softDivIDs) > 0 {
		fmt.Printf("limits phase2: soft-divert %d mixed keys\n", len(softDivIDs))
		startBatch(softDivIDs, plan.ReconnectProbes, a.ramp)
		liveCtx, liveCancel := context.WithTimeout(soakCtx, a.flagWait)
		_ = waitLive(liveCtx, st, int64(targetN+len(softDivIDs)), 100*time.Millisecond)
		liveCancel()
		// Brief settle for place / NATS apply.
		select {
		case <-soakCtx.Done():
		case <-time.After(500 * time.Millisecond):
		}
		on, off, total := countOnOff(st.cohortSlotCounts(cohortSoftDivert), softSlots)
		fmt.Printf("limits phase2: soft-divert place off_soft=%d on_soft=%d total=%d soft=%v homes=%s\n",
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
	err = waitSoftFull(fullCtx, watch, false, true, 500*time.Millisecond, &seenSoft, &seenFull)
	fullCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(watch, st, a.maxDrop, nil)
		return fmt.Errorf("phase3 full: %w", err)
	}
	softSlots = uniqueSorted(watch.softIDs())
	fullSlots = uniqueSorted(watch.fullIDs())
	fmt.Printf("limits phase3: full observed containers=%v live=%d\n", fullSlots, st.live.Load())

	// Phase 4: mixed keys after full — must not place on full container.
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
		fmt.Printf("limits phase4: full-probe place off_full=%d on_full=%d total=%d full=%v homes=%s\n",
			off, on, total, fullSlots, formatCounts(st.cohortSlotCounts(cohortFullProbe)))
	}

	waitSoak(soakCtx, done)
	cancelSoak()
	<-done

	softSlots = uniqueSorted(watch.softIDs())
	fullSlots = uniqueSorted(watch.fullIDs())
	if len(softSlots) > 0 {
		seenSoft = true
	}
	if len(fullSlots) > 0 {
		seenFull = true
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
		// Skip only when we recorded no divert placements; ≥2 replicas required for a pass.
		SkipDivertAssert: softTotal == 0,
		AffinityAccount:  accN,
		AffinityCorp:     corpN,
		AffinityAlliance: allN,
		RequireColoc:     a.requireColoc,
		FillSlotCounts:   st.cohortSlotCounts(cohortFill),
	}
	if err := finishReport(watch, st, a.maxDrop, &ev); err != nil {
		return err
	}
	return ev.assert()
}

type pressureRunArgs struct {
	wsURL                                 string
	clients                               int
	duration, ramp, reportEvery, flagWait time.Duration
	fillCorpID                            int64
	insecure                              bool
	maxDrop                               float64
	seedOnly, noSeed                      bool
	expectTarget, expectCutoff            int
	softDivert, fullProbes                int
	minDivertRatio                        float64
	require503                            bool
	requireColoc                          bool
	groups, groupSize                     int
	readIdle                              time.Duration
}

func runPressure(ctx context.Context, rdb *redis.Client, watch *placementWatcher, a pressureRunArgs) error {
	plan, err := buildPressurePlan(a.expectTarget, a.expectCutoff, a.clients, a.groups, a.groupSize, a.softDivert, a.fullProbes, a.fillCorpID, a.minDivertRatio)
	if err != nil {
		return err
	}
	ids, err := buildPressureIdentities(plan)
	if err != nil {
		return err
	}
	groupIDs := filterCohort(ids, cohortGroup)
	fillIDs := filterCohort(ids, cohortFill)
	softDivIDs := filterCohort(ids, cohortSoftDivert)
	fullProbeIDs := filterCohort(ids, cohortFullProbe)
	accN, corpN, allN := countAffinityKinds(append(append([]clientIdentity{}, softDivIDs...), fullProbeIDs...))
	gAcc, gCorp, gAll := countAffinityKinds(groupIDs)
	fmt.Printf("pressure plan: expect-target=%d expect-cutoff=%d groups=%d group-size=%d fill=%d soft_divert=%d full_probe=%d total=%d fill_corp=%d min_divert_ratio=%.2f\n",
		plan.ExpectTarget, plan.ExpectCutoff, plan.Groups, plan.GroupSize, plan.FillHolders, plan.SoftDivert, plan.FullProbes, plan.Clients, plan.FillCorpID, plan.MinDivertRatio)
	fmt.Printf("pressure sticky groups: clients=%d keys≈%d (account/corp/alliance members=%d/%d/%d)\n",
		len(groupIDs), plan.Groups, gAcc, gCorp, gAll)
	fmt.Printf("pressure divert keys: account=%d corp=%d alliance=%d\n", accN, corpN, allN)
	fmt.Printf("pressure prerequisite: eip sync target_clients=%d client_cutoff=%d; ≥2 websocket replicas; unique accounts (no per-user cap pile-up)\n",
		plan.ExpectTarget, plan.ExpectCutoff)

	if err := maybeSeed(ctx, rdb, ids, a.noSeed); err != nil {
		return err
	}
	if a.seedOnly {
		return nil
	}

	st := newStats()
	base := soakConfig{
		WSURL:       a.wsURL,
		Insecure:    a.insecure,
		ReadIdle:    a.readIdle,
		DialTimeout: 10 * time.Second,
	}
	soakCtx, cancelSoak := context.WithTimeout(ctx, a.duration)
	defer cancelSoak()

	var wg sync.WaitGroup
	startBatch := newBatchStarter(soakCtx, &wg, base, st)
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	runReporter(soakCtx, done, st, a.reportEvery)

	// Phase 0: sticky multi-tenant groups hold for the whole soak.
	fmt.Printf("pressure phase0: start %d sticky group clients (%d groups × %d)\n", len(groupIDs), plan.Groups, plan.GroupSize)
	startBatch(groupIDs, plan.ReconnectGroups, a.ramp)
	if err := waitLive(soakCtx, st, int64(len(groupIDs)), 100*time.Millisecond); err != nil {
		cancelSoak()
		<-done
		return fmt.Errorf("phase0 groups: %w", err)
	}
	if a.requireColoc {
		if err := assertNoColocSplits(st.affinityHomeSets()); err != nil {
			cancelSoak()
			<-done
			_ = finishReport(watch, st, a.maxDrop, nil)
			return fmt.Errorf("phase0 group coloc: %w", err)
		}
		fmt.Printf("pressure phase0: coloc ok affinities=%d homes=%s\n", len(st.affinityHomeSets()), formatAffinityHomes(st.affinityHomeSets()))
	}

	targetN := min(plan.ExpectTarget, len(fillIDs))
	var seenSoft, seenFull bool
	var softSlots, fullSlots []string

	// Phase 1: fill shared corp to soft (groups stay live).
	fmt.Printf("pressure phase1: fill %d (soft at %d, corp=%d) with groups still held\n", targetN, plan.ExpectTarget, plan.FillCorpID)
	startBatch(fillIDs[:targetN], plan.ReconnectHolders, a.ramp)
	wantLive := int64(len(groupIDs) + targetN)
	if err := waitLive(soakCtx, st, wantLive, 100*time.Millisecond); err != nil {
		cancelSoak()
		<-done
		return fmt.Errorf("phase1 fill: %w", err)
	}
	softCtx, softCancel := context.WithTimeout(soakCtx, a.flagWait)
	err = waitSoftFull(softCtx, watch, true, false, 500*time.Millisecond, &seenSoft, &seenFull)
	softCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(watch, st, a.maxDrop, nil)
		return fmt.Errorf("phase1 soft: %w", err)
	}
	softSlots = uniqueSorted(watch.softIDs())
	fmt.Printf("pressure phase1: soft containers=%v live=%d\n", softSlots, st.live.Load())

	// Phase 2: mixed keys while soft.
	if len(softDivIDs) > 0 {
		fmt.Printf("pressure phase2: soft-divert %d mixed keys\n", len(softDivIDs))
		startBatch(softDivIDs, plan.ReconnectProbes, a.ramp)
		liveCtx, liveCancel := context.WithTimeout(soakCtx, a.flagWait)
		_ = waitLive(liveCtx, st, wantLive+int64(len(softDivIDs)), 100*time.Millisecond)
		liveCancel()
		select {
		case <-soakCtx.Done():
		case <-time.After(500 * time.Millisecond):
		}
		on, off, total := countOnOff(st.cohortSlotCounts(cohortSoftDivert), softSlots)
		fmt.Printf("pressure phase2: soft-divert off_soft=%d on_soft=%d total=%d soft=%v\n", off, on, total, softSlots)
	}

	// Phase 3: fill to hard cutoff.
	restFill := fillIDs[targetN:]
	if len(restFill) > 0 {
		fmt.Printf("pressure phase3: fill %d more (full at %d)\n", len(restFill), plan.ExpectCutoff)
		startBatch(restFill, plan.ReconnectHolders, a.ramp)
	}
	liveCtx, liveCancel := context.WithTimeout(soakCtx, a.flagWait)
	_ = waitLive(liveCtx, st, int64(len(groupIDs)+plan.ExpectCutoff+len(softDivIDs)), 100*time.Millisecond)
	liveCancel()
	fullCtx, fullCancel := context.WithTimeout(soakCtx, a.flagWait)
	err = waitSoftFull(fullCtx, watch, false, true, 500*time.Millisecond, &seenSoft, &seenFull)
	fullCancel()
	if err != nil {
		cancelSoak()
		<-done
		_ = finishReport(watch, st, a.maxDrop, nil)
		return fmt.Errorf("phase3 full: %w", err)
	}
	softSlots = uniqueSorted(watch.softIDs())
	fullSlots = uniqueSorted(watch.fullIDs())
	fmt.Printf("pressure phase3: full containers=%v live=%d\n", fullSlots, st.live.Load())

	// Phase 4: mixed keys after full.
	if len(fullProbeIDs) > 0 {
		fmt.Printf("pressure phase4: full-probe %d mixed keys\n", len(fullProbeIDs))
		startBatch(fullProbeIDs, plan.ReconnectProbes, a.ramp/2)
		probeLive := int64(len(groupIDs) + plan.ExpectCutoff + len(softDivIDs) + len(fullProbeIDs))
		pCtx, pCancel := context.WithTimeout(soakCtx, a.flagWait)
		_ = waitLive(pCtx, st, probeLive, 100*time.Millisecond)
		pCancel()
		select {
		case <-soakCtx.Done():
		case <-time.After(500 * time.Millisecond):
		}
		on, off, total := countOnOff(st.cohortSlotCounts(cohortFullProbe), fullSlots)
		fmt.Printf("pressure phase4: full-probe off_full=%d on_full=%d total=%d full=%v\n", off, on, total, fullSlots)
	}

	fmt.Printf("pressure phase5: hold all live until duration ends (live=%d)\n", st.live.Load())
	waitSoak(soakCtx, done)
	cancelSoak()
	<-done

	softSlots = uniqueSorted(watch.softIDs())
	fullSlots = uniqueSorted(watch.fullIDs())
	if len(softSlots) > 0 {
		seenSoft = true
	}
	if len(fullSlots) > 0 {
		seenFull = true
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
		SkipDivertAssert:  softTotal == 0,
		AffinityAccount:   accN,
		AffinityCorp:      corpN,
		AffinityAlliance:  allN,
		RequireColoc:      a.requireColoc,
		FillSlotCounts:    st.cohortSlotCounts(cohortFill),
	}
	if err := finishReport(watch, st, a.maxDrop, &ev); err != nil {
		return err
	}
	if a.requireColoc {
		homes := st.affinityHomeSets()
		fmt.Printf("coloc: affinities=%d splits=%d\n", len(homes), len(findColocSplits(homes)))
		if err := assertNoColocSplits(homes); err != nil {
			return err
		}
	}
	return ev.assert()
}

// newBatchStarter returns a function that ramps a batch of workers onto soakCtx.
func newBatchStarter(soakCtx context.Context, wg *sync.WaitGroup, base soakConfig, st *stats) func([]clientIdentity, bool, time.Duration) {
	return func(batch []clientIdentity, reconnect bool, ramp time.Duration) {
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

func finishReport(watch *placementWatcher, st *stats, maxDrop float64, limits *limitsEvidence) error {
	soft := uniqueSorted(watch.softIDs())
	full := uniqueSorted(watch.fullIDs())
	place := st.placeCountsFromAffinity()
	fmt.Print(st.finalReport(soft, full, place))
	if limits != nil {
		fmt.Printf("limits_evidence: soft_seen=%v full_seen=%v refuse_503=%d require_503=%v fill_homes=%s\n",
			limits.SoftSeen, limits.FullSeen, limits.Refuse503, limits.Require503, formatCounts(limits.FillSlotCounts))
		fmt.Printf("limits_divert: soft=%v soft_divert off/on/total=%d/%d/%d full=%v full_probe off/on/total=%d/%d/%d mixed_keys account/corp/alliance=%d/%d/%d\n",
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
