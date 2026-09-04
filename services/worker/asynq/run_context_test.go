package asynq

import (
	"context"
	"maps"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/worker/taskrun"

	"github.com/hibiken/asynq"
)

// What a task can learn about its own run comes from the context the engine
// supplies, and this mux rewraps that context four times before a handler sees
// it — trace extraction, log binding, an operation context, and a span.
//
// Those values surviving is an assumption the archived-jobs failure path depends
// on: it stops retrying on the final attempt, and a run it cannot read reports
// no attempts at all, which would keep failing work in the queue instead of
// recording why it stopped.
func TestARunIsStillReadableAfterTheMuxWrapsTheContext(t *testing.T) {
	fake := redisfake.New(t)
	opt := asynq.RedisClientOpt{Addr: fake.Addr()}

	seen := make(chan taskrun.Run, 1)
	handlers := map[string]asynq.HandlerFunc{}
	task := eipnats.RefreshRegionMarketOrders
	handle(handlers, task, &taskrun.Dependencies{},
		func(ctx context.Context, _ eipnats.RegionMarketOrdersRequest, _ *taskrun.Dependencies) error {
			run, ok := taskrun.Current(ctx)
			if !ok {
				close(seen)
				return nil
			}
			seen <- run
			return nil
		})

	mux := asynq.NewServeMux()
	if err := mount(mux, fullHandlerSet(handlers)); err != nil {
		t.Fatalf("mount: %v", err)
	}
	// The same middleware SetupHandlers installs, so the context a handler gets
	// here is the one it gets in the worker.
	installTaskMiddleware(mux)

	srv := asynq.NewServer(opt, asynq.Config{
		Concurrency: 1,
		Queues:      map[string]int{task.DefaultPriority: 1},
	})
	go func() { _ = srv.Run(mux) }()
	t.Cleanup(func() { srv.Shutdown() })

	client := asynq.NewClient(opt)
	t.Cleanup(func() { _ = client.Close() })
	if _, err := client.Enqueue(
		asynq.NewTask(task.Name, []byte(`{"region_id":1,"station_id":2}`)),
		asynq.Queue(task.DefaultPriority),
	); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	select {
	case run, ok := <-seen:
		if !ok {
			t.Fatal("the handler could not read its own run; the mux's context wrapping lost it")
		}
		if run.Queue != task.DefaultPriority {
			t.Errorf("Queue = %q, want %q", run.Queue, task.DefaultPriority)
		}
		if run.ID == "" {
			t.Error("the run carries no task id, so a log cannot name what an operator sees")
		}
		if run.MaxRetries <= 0 {
			t.Errorf("MaxRetries = %d; a task that may never be retried is always on its final attempt",
				run.MaxRetries)
		}
		if run.Retried != 0 {
			t.Errorf("Retried = %d on a first delivery, want 0", run.Retried)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("the handler never ran")
	}
}

// fullHandlerSet pads a partial set so mount's registry check passes; only the
// task under test does anything.
func fullHandlerSet(handlers map[string]asynq.HandlerFunc) map[string]asynq.HandlerFunc {
	out := map[string]asynq.HandlerFunc{}
	for _, task := range eipnats.Tasks() {
		out[task.Name] = func(context.Context, *asynq.Task) error { return nil }
	}
	maps.Copy(out, handlers)
	return out
}
