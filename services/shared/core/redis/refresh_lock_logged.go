package redis

import (
	"context"

	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

// AcquireRefreshLockLogged takes the refresh lock named by lockKey (e.g.
// "esi:industry_systems:refresh_lock"), so only one task refreshes that resource
// at a time.
//
// shouldContinue false means another refresh holds the lock and the caller
// should return without treating it as an error. When it is true the caller must
// `defer cleanup()`.
func AcquireRefreshLockLogged(ctx context.Context, redisClient *redis.Client, lockKey string) (cleanup func(), shouldContinue bool) {
	lockAcquired, cleanupFunc, err := AcquireRefreshLock(ctx, redisClient, lockKey)
	if err != nil {
		logs.WarnCtx(ctx, "failed to acquire refresh lock", "error", err)
		return nil, false
	}
	if !lockAcquired {
		logs.InfoCtx(ctx, "skipping refresh, another refresh in progress")
		return nil, false
	}
	// Lock acquired successfully - caller should defer cleanup()
	return cleanupFunc, true
}
