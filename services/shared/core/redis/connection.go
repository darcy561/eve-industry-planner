package redis

import (
	"context"
	"errors"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared/logs"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

func Connect() (*redis.Client, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		// Parse Redis URL to handle password authentication
		opts, parseErr := redis.ParseURL(cfg.REDIS_URL)
		if parseErr != nil {
			// If URL parsing fails, fall back to basic connection (for backward compatibility)
			opts = &redis.Options{
				Addr: cfg.REDIS_URL,
			}
		}
		// Override timeouts and pool settings
		opts.DialTimeout = 5 * time.Second
		// Increased ReadTimeout to handle Lua script execution under load
		// Lua scripts can take longer when Redis is processing many concurrent operations
		opts.ReadTimeout = 10 * time.Second
		opts.WriteTimeout = 5 * time.Second
		// Increased pool size to handle concurrent rate limit checks from multiple workers
		opts.PoolSize = 20 // Max concurrent connections for performance under load

		client := redis.NewClient(opts)

		err := client.Ping(context.Background()).Err()
		if err == nil {
			i++
			message := fmt.Sprintf("Connected to Redis on attempt %d/%d", i, retryCount)
			logs.Debug(message)

			// Start background monitoring for connection health
			go monitorRedisConnection(client)

			return client, nil
		}
		i++
		message := fmt.Sprintf("Failed to connect to Redis. Attempt %d/%d. Error: %v", i, retryCount, err)
		logs.Error(message)
		client.Close()
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to Redis after %d attempts. Exiting...", retryCount)
	logs.Error(message)
	return nil, errors.New(message)
}

// monitorRedisConnection periodically checks Redis connection health and logs reconnections
func monitorRedisConnection(client *redis.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ctx := context.Background()

	for range ticker.C {
		err := client.Ping(ctx).Err()
		if err != nil {
			logs.Warn("Redis connection health check failed, attempting reconnect", "error", err)
			// The Redis client will automatically reconnect on next operation
			// We just need to wait for it
			time.Sleep(2 * time.Second)
			if err := client.Ping(ctx).Err(); err == nil {
				logs.Info("Redis reconnected successfully")
			}
		}
	}
}

func Cleanup(ctx context.Context, client *redis.Client) {
	if client == nil {
		return
	}
	_ = client.Close()
}
