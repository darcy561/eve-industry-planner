package capsoak

import (
	"context"
	"fmt"
	"time"

	soaklib "eve-industry-planner/testing/ws_soak/lib"
)

// runWebsocket holds soak clients to push WS occupancy, waits for scale-up,
// then cancels load and waits for scale-down (cordon/drain/scale playbook).
func runWebsocket(ctx context.Context, obs *Observer, cfg Config) error {
	cfg = cfg.withDefaults()
	switch cfg.Phase {
	case PhaseDown:
		return runWebsocketDown(ctx, obs, cfg)
	case PhaseUp:
		return runWebsocketUp(ctx, obs, cfg)
	default:
		if err := runWebsocketUp(ctx, obs, cfg); err != nil {
			return err
		}
		return runWebsocketDown(ctx, obs, cfg)
	}
}

func runWebsocketUp(ctx context.Context, obs *Observer, cfg Config) error {
	fmt.Printf("capacity_soak: websocket UP clients=%d ramp=%s min-live=%d want>=%d\n",
		cfg.Clients, cfg.Ramp, cfg.MinLive, cfg.MaxWatch)
	fmt.Println("capacity_soak: tip — unique accounts via soaklib hold (Accounts=Clients); sync target_clients; managed websocket")

	hold := startHold(ctx, cfg)
	defer hold.Stop()

	liveCtx, cancelLive := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelLive()
	census, err := waitWebsocketClients(liveCtx, obs, cfg.PollEvery, cfg.ReportEvery,
		"websocket live clients", cfg.MinLive, true, hold.Err)
	if err != nil {
		return fmt.Errorf("live clients: %w", err)
	}
	fmt.Printf("capacity_soak: live clients=%d backends=%d — waiting scale-up\n", census.Clients, census.Backends)

	upCtx, cancelUp := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelUp()
	sh, err := waitReplicas(upCtx, cfg.PollEvery, cfg.ReportEvery, "websocket scale-up",
		obs.ObserveWebsocket,
		func(s Shape) bool { return s.EffectiveReplicas() >= cfg.MaxWatch },
		hold.Err,
	)
	if err != nil {
		return fmt.Errorf("scale-up: %w", err)
	}
	fmt.Printf("capacity_soak: scaled up desired=%d running=%d (%s)\n", sh.Desired, sh.Running, sh.Source)
	return nil
}

func runWebsocketDown(ctx context.Context, obs *Observer, cfg Config) error {
	fmt.Printf("capacity_soak: websocket DOWN want<=%d (idle / underutilized cordon→drain→scale)\n", cfg.MinReplicas)

	idleCtx, cancelIdle := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelIdle()
	census, err := waitWebsocketClients(idleCtx, obs, cfg.PollEvery, cfg.ReportEvery,
		"websocket idle clients", 0, false, nil)
	if err != nil {
		return fmt.Errorf("idle clients: %w", err)
	}
	fmt.Printf("capacity_soak: clients idle=%d backends=%d — waiting scale-down\n", census.Clients, census.Backends)

	downCtx, cancelDown := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelDown()
	sh, err := waitReplicas(downCtx, cfg.PollEvery, cfg.ReportEvery, "websocket scale-down",
		obs.ObserveWebsocket,
		func(s Shape) bool { return s.EffectiveReplicas() <= cfg.MinReplicas },
		nil,
	)
	if err != nil {
		return fmt.Errorf("scale-down: %w", err)
	}
	fmt.Printf("capacity_soak: scaled down desired=%d running=%d (%s) OK\n", sh.Desired, sh.Running, sh.Source)
	return nil
}

// runAPI uses the same WS hold load but asserts api replica changes
// (controller Evaluate links api Scale to websocket clients).
func runAPI(ctx context.Context, obs *Observer, cfg Config) error {
	cfg = cfg.withDefaults()
	switch cfg.Phase {
	case PhaseDown:
		return runAPIDown(ctx, obs, cfg)
	case PhaseUp:
		return runAPIUp(ctx, obs, cfg)
	default:
		if err := runAPIUp(ctx, obs, cfg); err != nil {
			return err
		}
		return runAPIDown(ctx, obs, cfg)
	}
}

func runAPIUp(ctx context.Context, obs *Observer, cfg Config) error {
	fmt.Printf("capacity_soak: api UP (via WS clients=%d) ramp=%s min-live=%d want>=%d\n",
		cfg.Clients, cfg.Ramp, cfg.MinLive, cfg.MaxWatch)

	hold := startHold(ctx, cfg)
	defer hold.Stop()

	liveCtx, cancelLive := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelLive()
	census, err := waitWebsocketClients(liveCtx, obs, cfg.PollEvery, cfg.ReportEvery,
		"api drill live WS clients", cfg.MinLive, true, hold.Err)
	if err != nil {
		return fmt.Errorf("live clients: %w", err)
	}
	fmt.Printf("capacity_soak: live clients=%d — waiting api scale-up\n", census.Clients)

	upCtx, cancelUp := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelUp()
	sh, err := waitReplicas(upCtx, cfg.PollEvery, cfg.ReportEvery, "api scale-up",
		obs.ObserveAPI,
		func(s Shape) bool { return s.EffectiveReplicas() >= cfg.MaxWatch },
		hold.Err,
	)
	if err != nil {
		return fmt.Errorf("scale-up: %w", err)
	}
	fmt.Printf("capacity_soak: api scaled up desired=%d running=%d (%s)\n", sh.Desired, sh.Running, sh.Source)
	return nil
}

func runAPIDown(ctx context.Context, obs *Observer, cfg Config) error {
	fmt.Printf("capacity_soak: api DOWN want<=%d\n", cfg.MinReplicas)

	idleCtx, cancelIdle := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelIdle()
	if _, err := waitWebsocketClients(idleCtx, obs, cfg.PollEvery, cfg.ReportEvery,
		"api drill idle WS clients", 0, false, nil); err != nil {
		return fmt.Errorf("idle clients: %w", err)
	}

	downCtx, cancelDown := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelDown()
	sh, err := waitReplicas(downCtx, cfg.PollEvery, cfg.ReportEvery, "api scale-down",
		obs.ObserveAPI,
		func(s Shape) bool { return s.EffectiveReplicas() <= cfg.MinReplicas },
		nil,
	)
	if err != nil {
		return fmt.Errorf("scale-down: %w", err)
	}
	fmt.Printf("capacity_soak: api scaled down desired=%d running=%d (%s) OK\n", sh.Desired, sh.Running, sh.Source)
	return nil
}

func startHold(ctx context.Context, cfg Config) *wsHold {
	soakCtx, cancel := context.WithCancel(ctx)
	done := make(chan error, 1)
	clients := cfg.Clients
	if clients < 1 {
		clients = 1
	}
	go func() {
		// Standardized WS clients: soaklib ProfileHold with Accounts == Clients.
		done <- soaklib.Run(soakCtx, soaklib.Config{
			Profile:     soaklib.ProfileHold,
			WSURL:       cfg.WSURL,
			Clients:     clients,
			Accounts:    clients,
			Duration:    cfg.WSDuration + cfg.Timeout,
			Ramp:        cfg.Ramp,
			Reconnect:   true,
			Insecure:    cfg.Insecure,
			NoSeed:      cfg.NoSeed,
			SeedOnly:    cfg.SeedOnly,
			ReportEvery: cfg.ReportEvery,
			MaxDrop:     1.0,
		})
	}()
	return &wsHold{cancel: cancel, done: done}
}

type wsHold struct {
	cancel context.CancelFunc
	done   <-chan error
}

func (h *wsHold) Stop() {
	if h == nil {
		return
	}
	h.cancel()
	select {
	case err := <-h.done:
		if err != nil {
			fmt.Printf("capacity_soak: hold exit: %v\n", err)
		}
	case <-time.After(45 * time.Second):
		fmt.Println("capacity_soak: hold stop timed out")
	}
}

func (h *wsHold) Err() error {
	if h == nil {
		return nil
	}
	select {
	case err := <-h.done:
		if err != nil {
			return fmt.Errorf("hold ended early: %w", err)
		}
		return fmt.Errorf("hold ended early before wait finished")
	default:
		return nil
	}
}
