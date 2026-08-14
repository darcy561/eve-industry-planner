package asynq

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

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
			// Custom retry delay function that respects ESI rate limit RetryAfter times
			// CRITICAL: Adds jitter to prevent thundering herd when many tasks retry simultaneously
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				bg := context.Background()
				// Check if this is a rate limit error with RetryAfter
				rateLimitErr := extractRateLimitError(e)
				if rateLimitErr != nil && rateLimitErr.Retryable {
					// Calculate delay until RetryAfter time
					waitTime := time.Until(rateLimitErr.RetryAfter)
					if waitTime > 0 {
						// Add small buffer to ensure tokens are available
						waitTime += 1 * time.Second

						// CRITICAL: Add jitter to spread out retries and prevent thundering herd
						// Shared Redis ESI limiter + multi-replica workers can pile onto RetryAfter.
						// Jitter spreads retries over a window to prevent synchronized failures
						// Use 20% jitter (random 0-20% of wait time) to break synchronization
						// This ensures tasks don't all retry at exactly the same time
						jitterWindow := waitTime / 5 // 20% of wait time
						if jitterWindow > 0 {
							// Generate deterministic jitter based on task type and payload
							// This ensures each unique task gets consistent jitter across retries
							// but different tasks get different jitter values
							taskIDHash := uint64(0)
							taskTypeBytes := []byte(t.Type())
							payloadBytes := t.Payload()
							// Hash task type
							for _, b := range taskTypeBytes {
								taskIDHash = taskIDHash*31 + uint64(b)
							}
							// Hash payload (use first 100 bytes to avoid excessive computation)
							payloadLen := min(len(payloadBytes), 100)
							for i := range payloadLen {
								taskIDHash = taskIDHash*31 + uint64(payloadBytes[i])
							}
							jitter := time.Duration(taskIDHash % uint64(jitterWindow))
							finalWait := waitTime + jitter

							logs.DebugCtx(bg, "scheduling retry with jitter to prevent thundering herd",
								"task_type", t.Type(),
								"retry_attempt", n,
								"retry_after", rateLimitErr.RetryAfter,
								"base_wait", waitTime,
								"jitter", jitter,
								"final_wait", finalWait,
								"group", rateLimitErr.Group)
							return finalWait
						}

						logs.DebugCtx(bg, "scheduling retry based on rate limit RetryAfter",
							"task_type", t.Type(),
							"retry_attempt", n,
							"retry_after", rateLimitErr.RetryAfter,
							"wait_duration", waitTime,
							"group", rateLimitErr.Group)
						return waitTime
					}
					// RetryAfter is in the past, use minimum delay with jitter
					baseDelay := 5 * time.Second
					// Add small jitter even for minimum delay
					taskIDHash := uint64(0)
					taskTypeBytes := []byte(t.Type())
					payloadBytes := t.Payload()
					for _, b := range taskTypeBytes {
						taskIDHash = taskIDHash*31 + uint64(b)
					}
					payloadLen := min(len(payloadBytes), 100)
					for i := range payloadLen {
						taskIDHash = taskIDHash*31 + uint64(payloadBytes[i])
					}
					jitter := time.Duration(taskIDHash%1000) * time.Millisecond // 0-1s jitter
					return baseDelay + jitter
				}
				// Not a rate limit error or no RetryAfter - use exponential backoff with jitter
				// Base delay: 2 seconds, max delay: 5 minutes
				delay := min(time.Duration(1<<uint(n))*time.Second, 5*time.Minute)
				// Add jitter to exponential backoff (10% of delay)
				jitterWindow := delay / 10
				if jitterWindow > 0 {
					taskIDHash := uint64(0)
					taskTypeBytes := []byte(t.Type())
					payloadBytes := t.Payload()
					for _, b := range taskTypeBytes {
						taskIDHash = taskIDHash*31 + uint64(b)
					}
					payloadLen := min(len(payloadBytes), 100)
					for i := range payloadLen {
						taskIDHash = taskIDHash*31 + uint64(payloadBytes[i])
					}
					jitter := time.Duration(taskIDHash % uint64(jitterWindow))
					delay += jitter
				}
				return delay
			},
			// Mark retryable rate-limit yields as non-failures for asynq stats/reporting.
			// These are expected flow-control events (task re-queueing), not task defects.
			IsFailure: func(err error) bool {
				return !errIsRateLimitDeferral(err)
			},
			// Error handling
			// RateLimitError with Retryable=true is intentional (task returned to queue for retry)
			// Only log actual errors, not intentional retries
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				if errIsRateLimitDeferral(err) {
					rateLimitErr := extractRateLimitError(err)
					// Intentional retry - log at debug level, not error
					logs.DebugCtx(ctx, "asynq task returned to queue for rate limit retry",
						"task_type", task.Type(),
						"retry_after", rateLimitErr.RetryAfter,
						"reason", rateLimitErr.Reason,
						"group", rateLimitErr.Group)
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

// errIsRateLimitDeferral reports whether err is a retryable rate-limit yield (task re-queued later).
// Same cases as asynq.Config.IsFailure == false — not a logical task failure.
func errIsRateLimitDeferral(err error) bool {
	if err == nil {
		return false
	}
	rle := extractRateLimitError(err)
	return rle != nil && rle.Retryable
}

// extractRateLimitError unwraps errors to find a RateLimitError
func extractRateLimitError(err error) *esiratelimiter.RateLimitError {
	if err == nil {
		return nil
	}
	// Try direct match
	var rateLimitErr *esiratelimiter.RateLimitError
	if errors.As(err, &rateLimitErr) {
		return rateLimitErr
	}
	// Try unwrapping (for wrapped errors like fmt.Errorf("rate limited: %w", ...))
	unwrapped := errors.Unwrap(err)
	if unwrapped != nil {
		if errors.As(unwrapped, &rateLimitErr) {
			return rateLimitErr
		}
	}
	return nil
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
