package tasks

import (
	"context"
	"fmt"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	"github.com/hibiken/asynq"
)

// CountMarketPricesItems counts the number of market prices items in the database
// and caches the count. This count is used by the main refresh handler to calculate
// batch sizes. Runs every 4 hours to keep the count accurate as items are added/removed.
// Returns an error if processing fails - asynq will automatically retry on error.
func CountMarketPricesItems(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "Market Prices Count Task Received")

	// Acquire a lock to prevent concurrent counts
	lockKey := "esi:market_orders:count_lock"
	cleanup, shouldContinue := taskscore.AcquireRefreshLock(ctx, deps.Redis, lockKey)
	if !shouldContinue {
		// Lock already held - skip processing (not an error)
		logs.DebugCtx(ctx, "market prices count already in progress, skipping")
		return nil
	}
	defer cleanup()

	logs.DebugCtx(ctx, "counting market prices items")

	itemCount, err := rediscore.CountTotalMarketOrdersRefreshTimes(ctx, deps.Redis)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to count market orders refresh times", "error", err)
		return err
	}

	// Cache the count with 4.5 hour TTL (slightly longer than recalculation interval for safety)
	ttl := 4*time.Hour + 30*time.Minute
	if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, deps.Redis, itemCount, ttl); err != nil {
		logs.ErrorCtx(ctx, "failed to cache market orders count", "error", err)
		return err
	}

	logs.InfoCtx(ctx, "counted market prices items",
		"item_count", itemCount,
		"cache_ttl_hours", ttl.Hours())

	return nil
}
