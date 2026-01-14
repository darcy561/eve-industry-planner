package asynq

import (
	"context"
	"errors"
	"fmt"
	"time"

	"eve-industry-planner/shared/shared/logs"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// ServerConfig holds configuration for an asynq server
type ServerConfig struct {
	RedisOpt    asynq.RedisClientOpt
	Concurrency int
}

// setupESIServer creates and starts an asynq server dedicated to ESI tasks.
// ESI tasks can flood the queue, so they're isolated in their own server.
// handlerFunc is called to set up the task handlers (mux.HandleFunc calls).
// Concurrency is the worker pool size - controls how many tasks run concurrently.
// Returns the server instance and a cleanup function.
func setupESIServer(config ServerConfig, handlerFunc func(*asynq.ServeMux)) (*asynq.Server, func(context.Context), error) {
	// ESI server configuration - optimized for high-volume, rate-limited tasks
	// Concurrency IS the worker pool - controls how many ESI tasks run simultaneously
	esiConcurrency := min(config.Concurrency, 150) // Increased from 20 to maximize throughput across multiple rate limit groups

	srv := asynq.NewServer(
		config.RedisOpt,
		asynq.Config{
			Concurrency: esiConcurrency,
			// ESI tasks use PrimaryGroup-based queues for rate limit isolation.
			// All PrimaryGroups get equal weight (10) for equal distribution.
			// Markets group is split into high/low priority to prevent low-priority tasks from starving high-priority ones.
			Queues: map[string]int{
				"esi_markets_high": 10, // Adjusted prices - high priority within markets group
				"esi_markets_low":  3,  // Market prices - low priority within markets group
				"esi_industry":     10, // Industry group (system indexes)
				"esi_characters":   10, // Characters group (corporation claims)
				"esi_default":      10, // Unknown groups - default fallback
			},
			// Custom retry delay function that respects ESI rate limit RetryAfter times
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				// Check if this is a rate limit error with RetryAfter
				rateLimitErr := extractRateLimitError(e)
				if rateLimitErr != nil && rateLimitErr.Retryable {
					// Calculate delay until RetryAfter time
					waitTime := time.Until(rateLimitErr.RetryAfter)
					if waitTime > 0 {
						// Add small buffer to ensure tokens are available
						waitTime += 1 * time.Second
						logs.Info("scheduling retry based on rate limit RetryAfter",
							"task_type", t.Type(),
							"retry_attempt", n,
							"retry_after", rateLimitErr.RetryAfter,
							"wait_duration", waitTime,
							"group", rateLimitErr.Group)
						return waitTime
					}
					// RetryAfter is in the past, use minimum delay
					return 5 * time.Second
				}
				// Not a rate limit error or no RetryAfter - use exponential backoff
				// Base delay: 2 seconds, max delay: 5 minutes
				delay := min(time.Duration(1<<uint(n))*time.Second, 5*time.Minute)
				return delay
			},
			// Error handling
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				logs.Error("asynq ESI task failed",
					"task_type", task.Type(),
					"server_type", "esi",
					"error", err)
			}),
		},
	)

	// Create mux for routing ESI tasks to handlers
	mux := asynq.NewServeMux()

	// Set up handlers via callback function
	handlerFunc(mux)

	// Start server in background
	go func() {
		if err := srv.Run(mux); err != nil {
			logs.Error("asynq ESI server error", "error", err)
		}
	}()

	logs.Debug("asynq ESI server started",
		"concurrency", esiConcurrency,
		"queues", map[string]int{
			"esi_markets_high": 10,
			"esi_markets_low":  3,
			"esi_industry":     10,
			"esi_characters":   10,
			"esi_default":      10,
		})

	cleanup := func(ctx context.Context) {
		srv.Shutdown()
		logs.Info("asynq ESI server shut down")
	}

	return srv, cleanup, nil
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

// setupRegularServer creates and starts an asynq server for regular (non-ESI) tasks.
// These tasks don't interact with external APIs and won't flood the queue.
// handlerFunc is called to set up the task handlers (mux.HandleFunc calls).
// Concurrency is the worker pool size - controls how many tasks run concurrently.
// Returns the server instance and a cleanup function.
func setupRegularServer(config ServerConfig, handlerFunc func(*asynq.ServeMux)) (*asynq.Server, func(context.Context), error) {
	// Regular server configuration - for internal tasks
	// Concurrency IS the worker pool - can handle more since these don't hit external APIs
	srv := asynq.NewServer(
		config.RedisOpt,
		asynq.Config{
			Concurrency: config.Concurrency,
			// Regular tasks use separate queues
			Queues: map[string]int{
				"regular_high":   10, // Highest priority regular tasks (reserved for future)
				"regular_normal": 6,  // Normal priority regular tasks
				"regular_low":    3,  // Low priority regular tasks
				"auth":           1,  // Auth tasks (lowest priority)
			},
			// Error handling
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				logs.Error("asynq regular task failed",
					"task_type", task.Type(),
					"server_type", "regular",
					"error", err)
			}),
		},
	)

	// Create mux for routing regular tasks to handlers
	mux := asynq.NewServeMux()

	// Set up handlers via callback function
	handlerFunc(mux)

	// Start server in background
	go func() {
		if err := srv.Run(mux); err != nil {
			logs.Error("asynq regular server error", "error", err)
		}
	}()

	logs.Debug("asynq regular server started",
		"concurrency", config.Concurrency,
		"queues", map[string]int{
			"regular_high":   10,
			"regular_normal": 6,
			"regular_low":    3,
			"auth":           1,
		})

	cleanup := func(ctx context.Context) {
		srv.Shutdown()
		logs.Info("asynq regular server shut down")
	}

	return srv, cleanup, nil
}

// SetupServers sets up and starts both ESI and regular asynq servers.
// Returns cleanup functions for both servers.
func SetupServers(
	redisOpt asynq.RedisClientOpt,
	deps WorkerDependencies,
) (func(context.Context), func(context.Context), error) {
	// Setup and start ESI asynq server (handles ESI API tasks)
	// High concurrency maximizes throughput across different rate limit groups (markets, industry, characters, etc.).
	// When tasks find no tokens, they fail immediately and are requeued with delay, freeing the slot.
	// Higher concurrency ensures that when one group is exhausted, tasks from other groups with available
	// tokens can still process in parallel, maximizing overall throughput.
	esiServerConfig := ServerConfig{
		RedisOpt:    redisOpt,
		Concurrency: 150, // High concurrency to maximize throughput across all rate limit groups
	}
	esiServer, esiCleanup, err := setupESIServer(esiServerConfig, func(mux *asynq.ServeMux) {
		SetupESIHandlers(mux, deps)
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to setup ESI asynq server: %w", err)
	}

	// Setup and start regular asynq server (handles non-ESI tasks)
	regularServerConfig := ServerConfig{
		RedisOpt:    redisOpt,
		Concurrency: 20, // Regular tasks can handle more concurrency
	}
	regularServer, regularCleanup, err := setupRegularServer(regularServerConfig, func(mux *asynq.ServeMux) {
		SetupRegularHandlers(mux, deps)
	})
	if err != nil {
		// Cleanup ESI server if regular server setup fails
		esiCleanup(context.Background())
		return nil, nil, fmt.Errorf("failed to setup regular asynq server: %w", err)
	}

	// Prevent unused variable warnings
	_ = esiServer
	_ = regularServer

	logs.Info("asynq servers started", "total_count", 2)

	return esiCleanup, regularCleanup, nil
}
