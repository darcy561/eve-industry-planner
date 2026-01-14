package tasks

import (
	"context"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"

	"github.com/redis/go-redis/v9"
)

// AcquireRefreshLock acquires a distributed lock to prevent concurrent refresh operations for the same resource.
// The lock is identified by lockKey (e.g., "esi:industry_systems:refresh_lock") and ensures only one refresh
// task processes data for that resource at a time. If another refresh is already in progress, this function
// returns false to prevent duplicate work.
//
// Returns the cleanup function and a boolean indicating if processing should continue.
// If cleanup is returned and shouldContinue is true, the caller must call defer cleanup() to release the lock.
// If shouldContinue is false, another refresh is in progress and the caller should return (not an error).
func AcquireRefreshLock(ctx context.Context, redisClient *redis.Client, lockKey string) (cleanup func(), shouldContinue bool) {
	lockAcquired, cleanupFunc, err := rediscore.AcquireRefreshLock(ctx, redisClient, lockKey)
	if err != nil {
		logs.Warn("failed to acquire refresh lock", "error", err)
		return nil, false
	}
	if !lockAcquired {
		logs.Info("skipping refresh, another refresh in progress")
		return nil, false
	}
	// Lock acquired successfully - caller should defer cleanup()
	return cleanupFunc, true
}
