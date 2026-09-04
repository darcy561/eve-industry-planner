package asynq

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"

	"github.com/hibiken/asynq"
)

// MaxConcurrency is the hard per-process Asynq pool cap.
const MaxConcurrency = 50

// DefaultConcurrency is the per-process default when unset.
const DefaultConcurrency = 50

// ServerConfig holds configuration for an asynq server
type ServerConfig struct {
	RedisOpt    asynq.RedisClientOpt
	Concurrency int
}

// ResolveConcurrency clamps requested concurrency into [1, MaxConcurrency].
// Zero / negative → DefaultConcurrency.
func ResolveConcurrency(requested int) int {
	if requested <= 0 {
		requested = DefaultConcurrency
	}
	if requested > MaxConcurrency {
		return MaxConcurrency
	}
	return requested
}

// ConcurrencyFromEnv reads WORKER_ASYNQ_CONCURRENCY (optional). Empty → default.
func ConcurrencyFromEnv() int {
	raw := strings.TrimSpace(os.Getenv("WORKER_ASYNQ_CONCURRENCY"))
	if raw == "" {
		return DefaultConcurrency
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		logs.WarnCtx(context.Background(), "invalid WORKER_ASYNQ_CONCURRENCY; using default",
			"value", raw, "default", DefaultConcurrency)
		return DefaultConcurrency
	}
	return ResolveConcurrency(n)
}

// setupServer creates and starts an asynq server that handles all tasks.
// Uses a 5-tier priority queue system to ensure proper task scheduling.
// handlerFunc is called to set up the task handlers (mux.HandleFunc calls).
// Concurrency is the worker pool size - controls how many tasks run concurrently.
// Returns a cleanup function to shut down the server.
func setupServer(config ServerConfig, handlerFunc func(*asynq.ServeMux)) (func(context.Context), error) {
	// Concurrency IS the worker pool — hard-capped by MaxConcurrency (#7).
	concurrency := ResolveConcurrency(config.Concurrency)

	srv := asynq.NewServer(
		config.RedisOpt,
		asynq.Config{
			Concurrency: concurrency,
			Queues: map[string]int{
				"priority_1": 20, // Reserved for future critical tasks
				"priority_2": 15, // Urgent, user-impacting tasks
				"priority_3": 10, // Default, steady throughput tasks
				"priority_4": 5,  // High-volume background tasks
				"priority_5": 1,  // Reserved / bulk tasks
			},
			// An ESI refusal carries when to come back, so it sets the delay;
			// anything else backs off exponentially. Both are spread so replicas
			// that failed together do not return together.
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				if limit, ok := esiclient.AsRateLimit(e); ok {
					if wait := limit.RetryIn(); wait > 0 {
						// A small buffer past the stated time, so the budget the
						// refusal was waiting for has actually landed.
						return spread(wait+time.Second, 5, t)
					}
					return spread(5*time.Second, 5, t)
				}
				return spread(min(time.Duration(1<<uint(n))*time.Second, 5*time.Minute), 10, t)
			},
			// Mark retryable rate-limit yields as non-failures for asynq stats/reporting.
			// These are expected flow-control events (task re-queueing), not task defects.
			IsFailure: func(err error) bool {
				_, deferred := esiclient.AsRateLimit(err)
				return !deferred
			},
			// A retryable RateLimitError is the task going back on the queue as
			// intended, so it is not logged as a failure.
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				if limit, ok := esiclient.AsRateLimit(err); ok {
					logs.DebugCtx(ctx, "asynq task returned to queue for rate limit retry",
						"task_type", task.Type(),
						"kind", limit.Kind,
						"retry_in", limit.RetryIn(),
						"reason", limit.Reason,
						"bucket", limit.Bucket)
					return
				}
				// Actual error - log as error
				logs.ErrorCtx(ctx, "asynq task failed",
					"task_type", task.Type(),
					"error", err)
			}),
		},
	)

	// Create mux for routing tasks to handlers
	mux := asynq.NewServeMux()

	// Set up handlers via callback function
	handlerFunc(mux)

	// Start server in background
	go func() {
		bg := context.Background()
		if err := srv.Run(mux); err != nil {
			logs.ErrorCtx(bg, "asynq server error", "error", err)
		}
	}()

	logs.DebugCtx(context.Background(), "asynq server started",
		"concurrency", concurrency,
		"queues", map[string]int{
			"priority_1": 20,
			"priority_2": 15,
			"priority_3": 10,
			"priority_4": 5,
			"priority_5": 1,
		})

	cleanup := func(ctx context.Context) {
		srv.Shutdown()
		logs.InfoCtx(ctx, "asynq server shut down")
	}

	return cleanup, nil
}

// spread offsets a delay by up to percent of itself, derived from the task so
// one task keeps its offset across retries while differing from its neighbours.
// Worker replicas share one ESI limiter and so learn the same time to return;
// without this they would all return at once.
func spread(delay time.Duration, percent int, t *asynq.Task) time.Duration {
	window := delay * time.Duration(percent) / 100
	if window <= 0 {
		return delay
	}
	hash := uint64(0)
	for _, b := range []byte(t.Type()) {
		hash = hash*31 + uint64(b)
	}
	payload := t.Payload()
	for _, b := range payload[:min(len(payload), 100)] {
		hash = hash*31 + uint64(b)
	}
	return delay + time.Duration(hash%uint64(window))
}

// SetupServer sets up and starts an asynq server that handles all tasks.
// Returns a cleanup function for the server.
func SetupServer(
	redisOpt asynq.RedisClientOpt,
	deps WorkerDependencies,
) (func(context.Context), error) {
	// Per-process concurrency: default/cap 50 (#7). Operator YAML field is
	// services.worker.concurrency (#19); until make swarm-sync, WORKER_ASYNQ_CONCURRENCY is the bridge.
	serverConfig := ServerConfig{
		RedisOpt:    redisOpt,
		Concurrency: ConcurrencyFromEnv(),
	}
	cleanup, err := setupServer(serverConfig, func(mux *asynq.ServeMux) {
		SetupHandlers(mux, deps)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to setup asynq server: %w", err)
	}

	logs.InfoCtx(context.Background(), "asynq server started")

	return cleanup, nil
}
