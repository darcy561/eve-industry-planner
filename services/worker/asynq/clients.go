package asynq

import (
	"context"
	"fmt"
	"net/url"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"

	"github.com/hibiken/asynq"
)

// SetupClient creates and returns an asynq client for all tasks.
// It handles Redis connection configuration and client initialisation.
func SetupClient() (*asynq.Client, asynq.RedisClientOpt, error) {
	rawURL, err := config.RedisURL()
	if err != nil {
		return nil, asynq.RedisClientOpt{}, fmt.Errorf("failed to load redis config for asynq: %w", err)
	}

	redisURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, asynq.RedisClientOpt{}, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	// Extract password from URL if present
	redisPassword := ""
	if redisURL.User != nil {
		redisPassword, _ = redisURL.User.Password()
	}

	// Build Redis address for asynq
	redisAddr := redisURL.Host
	if redisAddr == "" {
		// Fallback if URL parsing doesn't work
		redisAddr = "redis:6379"
	}

	// Create asynq Redis client options
	redisOpt := asynq.RedisClientOpt{
		Addr:     redisAddr,
		Password: redisPassword,
		DB:       0, // asynq uses DB 0 by default
	}

	// Create asynq client for all tasks
	client := asynq.NewClient(redisOpt)

	logs.InfoCtx(context.Background(), "asynq client initialised", "redis_addr", redisAddr)

	return client, redisOpt, nil
}
