package capsoak

import (
	"context"
	"fmt"

	"github.com/hibiken/asynq"

	"eve-industry-planner/testing/harness"
)

// runWorker pauses an Asynq queue, enqueues pending work, waits for scale-up,
// unpauses so work drains, then waits for scale-down toward min.
func runWorker(ctx context.Context, obs *Observer, cfg Config) error {
	cfg = cfg.withDefaults()
	switch cfg.Phase {
	case PhaseDown:
		return runWorkerDown(ctx, obs, cfg)
	case PhaseUp:
		return runWorkerUp(ctx, obs, cfg)
	default:
		if err := runWorkerUp(ctx, obs, cfg); err != nil {
			return err
		}
		return runWorkerDown(ctx, obs, cfg)
	}
}

func runWorkerUp(ctx context.Context, obs *Observer, cfg Config) error {
	opt, err := harness.AsynqRedisOpt()
	if err != nil {
		return err
	}
	inspector := asynq.NewInspector(opt)
	defer func() { _ = inspector.Close() }()
	client := asynq.NewClient(opt)
	defer func() { _ = client.Close() }()

	fmt.Printf("capacity_soak: worker UP queue=%s enqueue=%d want>=%d\n",
		cfg.Queue, cfg.EnqueueN, cfg.MaxWatch)
	fmt.Println("capacity_soak: tip — short scale_* timing in eip.config; worker managed")

	if err := inspector.PauseQueue(cfg.Queue); err != nil {
		return fmt.Errorf("pause %s: %w", cfg.Queue, err)
	}
	defer func() {
		if err := inspector.UnpauseQueue(cfg.Queue); err != nil {
			fmt.Printf("capacity_soak: unpause %s: %v\n", cfg.Queue, err)
		}
	}()

	for i := 0; i < cfg.EnqueueN; i++ {
		_, err := client.EnqueueContext(ctx, asynq.NewTask(harness.CapacitySoakNoop, []byte(`{}`)), asynq.Queue(cfg.Queue))
		if err != nil {
			return fmt.Errorf("enqueue: %w", err)
		}
	}
	fmt.Printf("capacity_soak: enqueued %d paused tasks on %s\n", cfg.EnqueueN, cfg.Queue)

	upCtx, cancelUp := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelUp()
	sh, err := waitReplicas(upCtx, cfg.PollEvery, cfg.ReportEvery, "worker scale-up",
		obs.ObserveWorker,
		func(s Shape) bool { return s.EffectiveReplicas() >= cfg.MaxWatch },
		nil,
	)
	if err != nil {
		return fmt.Errorf("scale-up: %w", err)
	}
	fmt.Printf("capacity_soak: scaled up desired=%d running=%d (%s)\n", sh.Desired, sh.Running, sh.Source)
	return nil
}

func runWorkerDown(ctx context.Context, obs *Observer, cfg Config) error {
	opt, err := harness.AsynqRedisOpt()
	if err != nil {
		return err
	}
	inspector := asynq.NewInspector(opt)
	defer func() { _ = inspector.Close() }()

	fmt.Printf("capacity_soak: worker DOWN want<=%d\n", cfg.MinReplicas)
	if err := inspector.UnpauseQueue(cfg.Queue); err != nil {
		fmt.Printf("capacity_soak: unpause %s: %v\n", cfg.Queue, err)
	}

	downCtx, cancelDown := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelDown()
	sh, err := waitReplicas(downCtx, cfg.PollEvery, cfg.ReportEvery, "worker scale-down",
		obs.ObserveWorker,
		func(s Shape) bool { return s.EffectiveReplicas() <= cfg.MinReplicas },
		nil,
	)
	if err != nil {
		return fmt.Errorf("scale-down: %w", err)
	}
	fmt.Printf("capacity_soak: scaled down desired=%d running=%d (%s) OK\n", sh.Desired, sh.Running, sh.Source)
	return nil
}
