package capsoak

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/hibiken/asynq"
)

const soakTaskType = "capacitySoakNoop"

func redisOpt() asynq.RedisClientOpt {
	host := envOr("REDIS_HOST", "redis")
	port := envOr("REDIS_PORT", "6379")
	pass := strings.TrimSpace(os.Getenv("REDIS_PASSWORD"))
	return asynq.RedisClientOpt{
		Addr:     host + ":" + port,
		Password: pass,
		DB:       0,
	}
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

// runWorker pauses an Asynq queue, enqueues pending work, waits for scale-up,
// unpauses so work drains, then waits for scale-down toward min.
func runWorker(ctx context.Context, obs *Observer, cfg Config) error {
	cfg = cfg.withDefaults()
	opt := redisOpt()
	inspector := asynq.NewInspector(opt)
	defer func() { _ = inspector.Close() }()
	client := asynq.NewClient(opt)
	defer func() { _ = client.Close() }()

	fmt.Printf("capacity_soak: worker drill queue=%s enqueue=%d want>=%d then back to ~%d\n",
		cfg.Queue, cfg.EnqueueN, cfg.MaxWatch, cfg.MinReplicas)
	fmt.Println("capacity_soak: tip — use short scale_up/down_stabilization + cooldown in eip.config for demos")

	if err := inspector.PauseQueue(cfg.Queue); err != nil {
		return fmt.Errorf("pause %s: %w", cfg.Queue, err)
	}
	defer func() {
		if err := inspector.UnpauseQueue(cfg.Queue); err != nil {
			fmt.Printf("capacity_soak: unpause %s: %v\n", cfg.Queue, err)
		}
	}()

	for i := 0; i < cfg.EnqueueN; i++ {
		_, err := client.EnqueueContext(ctx, asynq.NewTask(soakTaskType, []byte(`{}`)), asynq.Queue(cfg.Queue))
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
	)
	if err != nil {
		return fmt.Errorf("scale-up: %w", err)
	}
	fmt.Printf("capacity_soak: scaled up desired=%d running=%d (%s)\n", sh.Desired, sh.Running, sh.Source)

	if err := inspector.UnpauseQueue(cfg.Queue); err != nil {
		return fmt.Errorf("unpause: %w", err)
	}
	fmt.Println("capacity_soak: queue unpaused — waiting for drain + scale-down")

	downCtx, cancelDown := context.WithTimeout(ctx, cfg.Timeout)
	defer cancelDown()
	sh, err = waitReplicas(downCtx, cfg.PollEvery, cfg.ReportEvery, "worker scale-down",
		obs.ObserveWorker,
		func(s Shape) bool { return s.EffectiveReplicas() <= cfg.MinReplicas },
	)
	if err != nil {
		return fmt.Errorf("scale-down: %w", err)
	}
	fmt.Printf("capacity_soak: scaled down desired=%d running=%d (%s) OK\n", sh.Desired, sh.Running, sh.Source)
	return nil
}
