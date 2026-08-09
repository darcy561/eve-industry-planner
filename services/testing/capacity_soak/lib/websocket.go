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
	fmt.Printf("capacity_soak: websocket drill clients=%d duration=%s want>=%d then ~%d\n",
		cfg.Clients, cfg.WSDuration, cfg.MaxWatch, cfg.MinReplicas)
	fmt.Println("capacity_soak: tip — sync low target_clients / short scale_* timing; managed websocket required")

	soakCtx, cancelSoak := context.WithCancel(ctx)
	defer cancelSoak()

	errCh := make(chan error, 1)
	go func() {
		errCh <- soaklib.Run(soakCtx, soaklib.Config{
			Profile:     soaklib.ProfileHold,
			WSURL:       cfg.WSURL,
			Clients:     cfg.Clients,
			Duration:    cfg.WSDuration + cfg.Timeout, // harness cancels early
			Reconnect:   true,
			Insecure:    cfg.InsecureTLS,
			NoSeed:      cfg.NoSeed,
			SeedOnly:    cfg.SeedOnly,
			ReportEvery: cfg.ReportEvery,
		})
	}()

	// Give clients time to connect before asserting scale-up.
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(20 * time.Second):
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("ws soak ended early: %w", err)
		}
	}

	upCtx, cancelUp := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelUp()
	sh, err := waitReplicas(upCtx, cfg.PollEvery, cfg.ReportEvery, "websocket scale-up",
		obs.ObserveWebsocket,
		func(s Shape) bool { return s.EffectiveReplicas() >= cfg.MaxWatch },
	)
	if err != nil {
		cancelSoak()
		<-errCh
		return fmt.Errorf("scale-up: %w", err)
	}
	fmt.Printf("capacity_soak: scaled up desired=%d running=%d (%s)\n", sh.Desired, sh.Running, sh.Source)

	cancelSoak()
	if err := <-errCh; err != nil && soakCtx.Err() == nil {
		fmt.Printf("capacity_soak: soak exit: %v\n", err)
	}
	fmt.Println("capacity_soak: load stopped — waiting for underutilized cordon/drain/scale-down")

	downCtx, cancelDown := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelDown()
	sh, err = waitReplicas(downCtx, cfg.PollEvery, cfg.ReportEvery, "websocket scale-down",
		obs.ObserveWebsocket,
		func(s Shape) bool { return s.EffectiveReplicas() <= cfg.MinReplicas },
	)
	if err != nil {
		return fmt.Errorf("scale-down: %w", err)
	}
	fmt.Printf("capacity_soak: scaled down desired=%d running=%d (%s) OK\n", sh.Desired, sh.Running, sh.Source)
	return nil
}
