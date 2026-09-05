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
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"

	"github.com/hibiken/asynq"
)

// MaxConcurrency is the hard per-process Asynq pool cap.
const MaxConcurrency = 50

// DrainTimeout is how long a stopping worker waits for the tasks already running
// to finish. What overruns it is pushed back to Redis and runs again elsewhere,
// so this trades a slower stop against repeating work — and every task can
// already run twice, since both the queue and the stream redeliver.
//
// It is stated rather than left to the library's 8s default because it has to sit
// inside the stack's stop grace alongside the other cleanups, and because a
// replica rolled mid-task should get a fair chance to finish it.
const DrainTimeout = 25 * time.Second

// DefaultConcurrency is the per-process default when unset.
const DefaultConcurrency = 50

// pollWeights is how often the server checks each queue relative to the others,
// and it is the worker's own: the fractions the capacity controller scales on
// live in shared/queuescale and answer a different question.
//
// Declared once because it is both what the server is configured with and what
// the startup log reports; two copies drift the moment a weight is retuned.
var pollWeights = map[string]int{
	eipnats.Priority1: 20, // reserved for future critical tasks
	eipnats.Priority2: 15, // urgent, user-impacting
	eipnats.Priority3: 10, // default, steady throughput
	eipnats.Priority4: 5,  // high-volume background
	eipnats.Priority5: 1,  // reserved / bulk
}

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

// setupServer creates and starts an asynq server across the five priority
// queues. handlerFunc wires the mux and is allowed to refuse: nothing starts if
// the handlers do not cover the registry. Returns a cleanup that stops the
// server.
func setupServer(config ServerConfig, handlerFunc func(*asynq.ServeMux) error) (func(context.Context), error) {
	// Concurrency IS the worker pool — hard-capped by MaxConcurrency (#7).
	concurrency := ResolveConcurrency(config.Concurrency)

	srv := asynq.NewServer(
		config.RedisOpt,
		asynq.Config{
			Concurrency:     concurrency,
			ShutdownTimeout: DrainTimeout,
			Queues:          pollWeights,
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

	mux := asynq.NewServeMux()
	if err := handlerFunc(mux); err != nil {
		return nil, err
	}

	// Start server in background
	go func() {
		bg := context.Background()
		if err := srv.Run(mux); err != nil {
			logs.ErrorCtx(bg, "asynq server error", "error", err)
		}
	}()

	logs.DebugCtx(context.Background(), "asynq server started",
		"concurrency", concurrency,
		"queues", pollWeights)

	cleanup := func(ctx context.Context) {
		// Stop before Shutdown: Stop ends the fetch loop, so the drain that
		// follows is finite work rather than a race with a queue still handing out
		// tasks. Shutdown alone would do both at once.
		srv.Stop()
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
	taskDeps *taskrun.Dependencies,
) (func(context.Context), error) {
	// Per-process concurrency: default/cap 50 (#7). Operator YAML field is
	// services.worker.concurrency (#19); until make swarm-sync, WORKER_ASYNQ_CONCURRENCY is the bridge.
	serverConfig := ServerConfig{
		RedisOpt:    redisOpt,
		Concurrency: ConcurrencyFromEnv(),
	}
	cleanup, err := setupServer(serverConfig, func(mux *asynq.ServeMux) error {
		return SetupHandlers(mux, taskDeps)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to setup asynq server: %w", err)
	}

	logs.InfoCtx(context.Background(), "asynq server started")

	return cleanup, nil
}
