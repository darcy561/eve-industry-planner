package soaklib

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// FilterSubjects debounce on the websocket host is 100ms; multi-tenant upgrades need headroom.
// Exact delivery only expects ready (post-settle) recipients — the widen/DeliverNew gap is accepted.
const (
	fanoutFilterSettleMin     = 300 * time.Millisecond
	fanoutFilterSettleMax     = 2 * time.Second
	fanoutDefaultRamp         = 30 * time.Second
	fanoutBootstrapEmitMin    = 10 * time.Millisecond
	fanoutBootstrapEmitMax    = 100 * time.Millisecond
	fanoutContinuousEmitEvery = 1 * time.Second
)

// runFanout is a thin supervisor: tenantGen → churnPool → live publisher (+ delivery + reporter).
func runFanout(ctx context.Context, rdb *redis.Client, watch *placementWatcher, cfg Config) error {
	clients := cfg.Clients
	if clients < 1 {
		clients = 500
	}
	// Soft floor only (0 = none). Duration owns stop; do not fail the run for under-min pubs.
	messages := cfg.FanoutMessages
	if messages < 0 {
		messages = 0
	}
	rate := cfg.FanoutRate
	if rate <= 0 {
		rate = 100
	}
	maxLoss := cfg.FanoutMaxLoss
	if maxLoss < 0 {
		maxLoss = 0
	}
	publishMode := cfg.Publish
	if publishMode == "" || publishMode == PublishNone {
		publishMode = PublishJetStream
	}
	if publishMode == PublishMongo {
		return fmt.Errorf("fanout: publish=mongo not implemented yet (use -publish jetstream)")
	}
	flagWait := cfg.FlagWait
	if flagWait <= 0 {
		flagWait = 90 * time.Second
	}
	ramp := cfg.Ramp
	if ramp <= 0 && clients >= 50 {
		ramp = fanoutDefaultRamp
	}
	bootstrapEvery := fanoutBootstrapEmitEvery(ramp, clients)
	liveRatio := cfg.FanoutLiveRatio
	if liveRatio <= 0 {
		liveRatio = defaultFanoutLiveRatio
	}
	affMix := cfg.FanoutAffinityMix
	if affMix <= 0 {
		affMix = defaultFanoutAffinityMix
	}

	allianceBase := cfg.AllianceID
	corpBase := cfg.CorpID
	standaloneBase := int64(0)
	if corpBase != 0 {
		standaloneBase = corpBase + 100000
	}

	genOpts := TenantGenOptions{
		Clients:         clients,
		Seed:            cfg.FanoutSeed,
		AffinityMix:     affMix,
		EmitEvery:       bootstrapEvery,
		Continuous:      true,
		ContinuousEvery: fanoutContinuousEmitEvery,
		// Cap inventory at bootstrap — unbounded growth burns harness CPU, not WS capacity.
		MaxClients:     clients,
		AllianceBase:   allianceBase,
		CorpBase:       corpBase,
		StandaloneBase: standaloneBase,
		Redis:          rdb,
		NoSeed:         cfg.NoSeed,
	}

	if cfg.SeedOnly {
		seedOpts := genOpts
		seedOpts.Continuous = false
		topo, genStats, err := CollectTenantGen(ctx, seedOpts)
		if err != nil {
			return fmt.Errorf("fanout tenantGen seed-only: %w", err)
		}
		fmt.Printf("fanout seed-only: clients=%d events=%d seed_calls=%d %s\n",
			len(topo.All), genStats.Emitted.Load(), genStats.SeedCalls.Load(), topo.summary())
		return nil
	}

	pub, err := NewPublisher(publishMode)
	if err != nil {
		return err
	}
	defer func() { _ = pub.Close() }()

	track := newDeliveryTracker(defaultDeliveryRecvBuf)
	track.Start()
	defer track.Close()

	readySettle := fanoutFilterSettle(max(clients/20, 4))
	if readySettle < DefaultReadySettle {
		readySettle = DefaultReadySettle
	}
	reg := newLiveRegistry(readySettle)
	st := newStats()
	base := soakConfig{
		WSURL:       cfg.WSURL,
		Insecure:    cfg.Insecure,
		Reconnect:   true,
		ReadIdle:    cfg.ReadIdle,
		DialTimeout: 10 * time.Second,
		DocRecv:     track.OfferRecv,
		Live:        reg,
		ReadySettle: readySettle,
	}

	// Workers stay on runCtx through drain.
	// Wall = ramp (connect / FilterSubjects storm, no soak pubs) + duration (steady JetStream pubs).
	runCtx, cancelRun := context.WithCancel(ctx)
	defer cancelRun()
	wall := ramp + cfg.Duration
	if wall < cfg.Duration {
		wall = cfg.Duration
	}
	wallCtx, cancelWall := context.WithTimeout(runCtx, wall)
	defer cancelWall()

	wantLive := int64(float64(clients)*liveRatio + 0.5)
	if wantLive < 1 {
		wantLive = 1
	}
	minReady := int(wantLive)
	if minReady > defaultPublishGateReady {
		// Gate on a stable subset so publishing can start once churn has a usable mix.
		minReady = defaultPublishGateReady
		if int(wantLive/2) > minReady {
			minReady = int(wantLive / 2)
		}
	}

	fmt.Printf("fanout plan: bootstrap_clients=%d max_clients=%d messages_soft=%d rate=%.1f/s publish=%s max_loss=%.3f ramp=%s publish_duration=%s wall=%s bootstrap_emit=%s continuous_emit=%s ready_settle=%s live_ratio=%.2f affinity_mix=%.2f gate_ready>=%d require_coloc=%v seed=%d\n",
		clients, clients, messages, rate, publishMode, maxLoss, ramp, cfg.Duration, wall, bootstrapEvery, fanoutContinuousEmitEvery, readySettle, liveRatio, affMix, minReady, cfg.RequireColoc, cfg.FanoutSeed)
	fmt.Printf("fanout phases: (1) ramp/connect only — expect NATS FilterSubjects spike; (2) then JetStream pubs ~%.0f/s for %s\n", rate, cfg.Duration)
	fmt.Printf("fanout kinds: account | corp_full | corp_down_account | alliance_full | alliance_down_corp | alliance_down_account\n")
	fmt.Printf("fanout collections: %s\n", strings.Join(fanoutCollections, ", "))
	fmt.Printf("fanout note: FilterSubjects widen gap accepted; exact expects use ready (post-settle) recipients only\n")
	fmt.Printf("fanout prerequisite: tenantGen+churnPool then publisher; JetStream doc-update-stream; Redis seed+grants; exact delivery\n")

	genCh, genStats, genErrCh := StartTenantGen(wallCtx, genOpts)
	churnStats, churnErrCh, freezeChurn := StartChurnPool(runCtx, ChurnPoolOptions{
		GenCh:        genCh,
		LiveRatio:    liveRatio,
		Seed:         cfg.FanoutSeed,
		LeaveTimeout: flagWait,
		Pending:      track.HasPendingAccount,
		RunIdentity: func(wctx context.Context, id clientIdentity) {
			runWorker(wctx, base, id, st)
		},
	})

	done := make(chan struct{})
	go func() {
		defer close(done)
		<-wallCtx.Done()
		time.Sleep(10 * time.Millisecond)
	}()
	runFanoutReporter(wallCtx, done, st, genStats, churnStats, track, reg, affMix, cfg.ReportEvery)

	type pubResult struct {
		stats *fanoutPublisherStats
		err   error
	}
	pubCh := make(chan pubResult, 1)
	go func() {
		if ramp > 0 {
			fmt.Printf("fanout phase: ramp/connect (%s) — soak JetStream publish held\n", ramp)
			timer := time.NewTimer(ramp)
			select {
			case <-wallCtx.Done():
				timer.Stop()
				pubCh <- pubResult{stats: &fanoutPublisherStats{}, err: nil}
				return
			case <-timer.C:
			}
		}
		fmt.Printf("fanout phase: publish window starting (%s at ~%.0f/s)\n", cfg.Duration, rate)
		pubCtx, cancelPub := context.WithTimeout(wallCtx, cfg.Duration)
		defer cancelPub()
		stats, err := runFanoutPublisher(pubCtx, FanoutPublisherOptions{
			Reg:         reg,
			Track:       track,
			Pub:         pub,
			Messages:    messages,
			Rate:        rate,
			Seed:        cfg.FanoutSeed,
			UntilDone:   true,
			MinReady:    minReady,
			MinSolo:     defaultPublishGateSolo,
			MinCorp:     defaultPublishGateCorp,
			MinAlliance: defaultPublishGateAlliance,
			GateWait:    flagWait,
		})
		pubCh <- pubResult{stats: stats, err: err}
	}()

	drainGenErr := func() {
		for range genErrCh {
		}
	}
	drainChurnErr := func() {
		for range churnErrCh {
		}
	}
	shutdownFail := func(err error) error {
		cancelWall()
		freezeChurn()
		cancelRun()
		drainGenErr()
		select {
		case <-pubCh:
		default:
		}
		drainChurnErr()
		return err
	}

	// Wall phase: ramp + publish. Fail fast on hard errors; wall deadline is success.
	var pubStats *fanoutPublisherStats
	genWait := genErrCh
	churnWait := churnErrCh
	phaseLoop := true
	for phaseLoop {
		select {
		case <-wallCtx.Done():
			phaseLoop = false
		case pr := <-pubCh:
			pubStats = pr.stats
			if pr.err != nil && wallCtx.Err() == nil {
				return shutdownFail(pr.err)
			}
			phaseLoop = false
		case err, ok := <-genWait:
			if !ok {
				genWait = nil
				continue
			}
			if err != nil && wallCtx.Err() == nil {
				return shutdownFail(fmt.Errorf("tenantGen: %w", err))
			}
		case err, ok := <-churnWait:
			if !ok {
				return shutdownFail(fmt.Errorf("churnPool: exited early"))
			}
			if err != nil {
				return shutdownFail(fmt.Errorf("churnPool: %w", err))
			}
		}
	}

	// Soft stop: halt pubs + tenant invent, freeze churn, wait both producers exit, then drain.
	fmt.Printf("fanout stopping publish/gen (recv=%d/%d pending=%d)…\n",
		track.Recv.Load(), track.Expect.Load(), track.PendingCount())
	cancelWall()
	freezeChurn()
	if pubStats == nil {
		pr := <-pubCh
		pubStats = pr.stats
		// Duration / cancel stop is success for UntilDone; only hard publisher faults fail the soak.
		if pr.err != nil && wallCtx.Err() == nil {
			return shutdownFail(pr.err)
		}
	}
	if genWait != nil {
		drainGenErr()
	}
	fmt.Printf("fanout publish/gen stopped: pubs=%d skipped=%d expect_recv=%d pending=%d (%s)\n",
		pubStatsPublished(pubStats), pubStatsSkipped(pubStats), track.Expect.Load(), track.PendingCount(), reg.summary())
	fmt.Printf("fanout modules: gen_events=%d gen_blocked=%d clients_gen=%d %s\n",
		genStats.Emitted.Load(), genStats.GenBlocked.Load(), genStats.Clients.Load(), churnStats.summary())
	if messages > 0 && pubStatsPublished(pubStats) < messages {
		fmt.Printf("fanout warn: pubs=%d below soft min %d (duration ended — continuing drain)\n",
			pubStatsPublished(pubStats), messages)
	}

	drainWait := flagWait
	if drainWait > 60*time.Second {
		drainWait = 60 * time.Second
	}
	fmt.Printf("fanout draining delivery (timeout=%s, workers held)…\n", drainWait)
	drainCtx, drainCancel := context.WithTimeout(context.Background(), drainWait)
	drainErr := waitDeliveryDrain(drainCtx, track)
	drainCancel()
	if drainErr != nil {
		_ = finishReport(watch, st, cfg.MaxDrop, nil)
		fmt.Println(track.ReportLine())
		fmt.Println(track.KindReportLine())
		fmt.Println(track.FormatPendingDump())
		cancelRun()
		drainChurnErr()
		return fmt.Errorf("fanout drain: %w", drainErr)
	}
	fmt.Printf("fanout drain complete: recv=%d/%d pending=%d\n",
		track.Recv.Load(), track.Expect.Load(), track.PendingCount())

	fmt.Printf("fanout stopping workers…\n")
	cancelRun()
	for err := range churnErrCh {
		if err != nil {
			return fmt.Errorf("churnPool: %w", err)
		}
	}

	if err := finishReport(watch, st, cfg.MaxDrop, nil); err != nil {
		return err
	}
	homes := st.affinityHomeSets()
	fmt.Printf("fanout place_homes: %s\n", formatAffinityHomes(homes))
	fmt.Printf("fanout affinity_mix=%.2f gen_blocked=%d %s\n", affMix, genStats.GenBlocked.Load(), churnStats.summary())
	fmt.Println(track.ReportLine())
	fmt.Println(track.KindReportLine())

	if cfg.RequireColoc {
		if err := assertSharedOrgAffinityColoc(homes); err != nil {
			return err
		}
		fmt.Printf("fanout coloc: ok shared_org_affinities (homes=%s)\n", formatAffinityHomes(homes))
	}

	if err := track.AssertExact(maxLoss); err != nil {
		fmt.Println(track.FormatPendingDump())
		return err
	}
	fmt.Printf("fanout pass: recv=%d/%d loss=0.000 wrong=0 dup=0 offline_hit=0 latency=%s scopes_ok=%d churn=%s gen_clients=%d\n",
		track.Recv.Load(), track.Expect.Load(), track.AvgLatency(), st.ScopesOK.Load(), churnStats.summary(), genStats.Clients.Load())
	return nil
}

func fanoutBootstrapEmitEvery(ramp time.Duration, clients int) time.Duration {
	if clients < 1 {
		clients = 1
	}
	if ramp <= 0 {
		return fanoutBootstrapEmitMin
	}
	every := ramp / time.Duration(clients)
	if every < fanoutBootstrapEmitMin {
		return fanoutBootstrapEmitMin
	}
	if every > fanoutBootstrapEmitMax {
		return fanoutBootstrapEmitMax
	}
	return every
}

func runFanoutReporter(
	ctx context.Context,
	done <-chan struct{},
	st *stats,
	gen *TenantGenStats,
	churn *ChurnPoolStats,
	track *deliveryTracker,
	reg *liveRegistry,
	affMix float64,
	every time.Duration,
) {
	if every <= 0 {
		return
	}
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		var lastPubs uint64
		var lastAt time.Time
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-t.C:
				pubs := track.Pubs.Load()
				rateStr := "pub_rate=(n/a)"
				now := time.Now()
				if !lastAt.IsZero() {
					dt := now.Sub(lastAt).Seconds()
					if dt > 0 {
						rateStr = fmt.Sprintf("pub_rate=%.1f/s", float64(pubs-lastPubs)/dt)
					}
				}
				lastPubs, lastAt = pubs, now
				fmt.Printf("%s gen_blocked=%d affinity_mix=%.2f %s %s pubs=%d %s recv=%d/%d wrong=%d pending=%d %s\n",
					st.snapshotLine("fanout"),
					gen.GenBlocked.Load(),
					affMix,
					churn.summary(),
					reg.summary(),
					pubs,
					rateStr,
					track.Recv.Load(),
					track.Expect.Load(),
					track.Wrong.Load(),
					track.PendingCount(),
					track.KindReportLine(),
				)
			}
		}
	}()
}

func pubStatsPublished(s *fanoutPublisherStats) int {
	if s == nil {
		return 0
	}
	return s.Published
}

func fanoutFilterSettle(tenantish int) time.Duration {
	d := fanoutFilterSettleMin + time.Duration(tenantish)*5*time.Millisecond
	if d > fanoutFilterSettleMax {
		return fanoutFilterSettleMax
	}
	return d
}

func waitReady(ctx context.Context, reg *liveRegistry, want int, wait time.Duration) error {
	if want < 1 {
		return nil
	}
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		if reg.ReadyCount() >= want {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("context done before ready>=%d (have %d live=%d)", want, reg.ReadyCount(), reg.LiveCount())
		case <-time.After(50 * time.Millisecond):
		}
	}
	return fmt.Errorf("timeout waiting ready>=%d (have %d live=%d)", want, reg.ReadyCount(), reg.LiveCount())
}

func waitDeliveryRecv(ctx context.Context, track *deliveryTracker, want uint64, wait time.Duration) error {
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		if track.Recv.Load() >= want {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("context done before recv>=%d (have %d)", want, track.Recv.Load())
		case <-time.After(50 * time.Millisecond):
		}
	}
	return fmt.Errorf("timeout waiting recv>=%d (have %d wrong=%d pending=%d)",
		want, track.Recv.Load(), track.Wrong.Load(), track.PendingCount())
}

// waitDeliveryDrain waits until all open expects are satisfied (pending=0).
func waitDeliveryDrain(ctx context.Context, track *deliveryTracker) error {
	if track == nil {
		return fmt.Errorf("delivery drain: no tracker")
	}
	want := track.Expect.Load()
	for {
		if track.PendingCount() == 0 && track.Recv.Load() >= want {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("context done before drain (recv=%d/%d pending=%d wrong=%d)",
				track.Recv.Load(), want, track.PendingCount(), track.Wrong.Load())
		case <-time.After(50 * time.Millisecond):
		}
	}
}

func pubStatsSkipped(s *fanoutPublisherStats) int {
	if s == nil {
		return 0
	}
	return s.Skipped
}

// ParsePublishMode maps CLI -publish values.
func ParsePublishMode(s string) (PublishMode, error) {
	switch PublishMode(strings.TrimSpace(s)) {
	case PublishNone, PublishJetStream, PublishMongo:
		return PublishMode(strings.TrimSpace(s)), nil
	default:
		return "", fmt.Errorf("publish must be none|jetstream|mongo, got %q", s)
	}
}
