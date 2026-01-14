package esi

import (
	"context"
	"encoding/json"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/scheduler"
	taskscore "eve-industry-planner/shared/tasks"
)

// ScheduleMarketPricesTotalRecalculation sets up a periodic task to recalculate
// the total number of market prices items in the database. This count is cached
// and used by the main refresh handler to calculate batch sizes.
// Runs every 4 hours to keep the count accurate as items are added/removed.
// Returns a cleanup function and an error if scheduling fails.
func ScheduleMarketPricesTotalRecalculation(deps scheduler.Dependencies, sched scheduler.Scheduler) (func(), error) {
	redisClient := deps.Redis
	log := deps.Log

	// Register handler for recalculating total item count (runs every 4 hours)
	// This is a lightweight operation that counts all items in the sorted set
	sched.RegisterHandler(taskscore.TaskTypeRecalculateMarketPricesTotal, func(ctx context.Context, data json.RawMessage) error {
		log.Debug("recalculating total market prices item count")

		totalCount, err := rediscore.CountTotalMarketOrdersRefreshTimes(ctx, redisClient)
		if err != nil {
			log.Error("failed to count total market orders refresh times", "error", err)
			return err
		}

		// Cache the total count with 4.5 hour TTL (slightly longer than recalculation interval for safety)
		ttl := 4*time.Hour + 30*time.Minute
		if err := rediscore.SetCachedTotalMarketOrdersCount(ctx, redisClient, totalCount, ttl); err != nil {
			log.Error("failed to cache total market orders count", "error", err)
			return err
		}

		log.Info("recalculated total market prices item count",
			"total_items", totalCount,
			"cache_ttl_hours", ttl.Hours())

		return nil
	})

	return func() {}, nil
}
