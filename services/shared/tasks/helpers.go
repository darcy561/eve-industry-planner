package tasks

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
)

// AcquireRefreshLock acquires a distributed lock to prevent concurrent refresh operations for the same resource.
// The lock is identified by lockKey (e.g., "esi:industry_systems:refresh_lock") and ensures only one refresh
// task processes data for that resource at a time. If another refresh is already in progress, this function
// acknowledges the message and returns false to prevent duplicate work.
//
// Returns the cleanup function and a boolean indicating if processing should continue.
// If cleanup is returned and shouldContinue is true, the caller must call defer cleanup() to release the lock.
// If shouldContinue is false, the message has been acknowledged (another refresh is in progress) and the caller should return.
func AcquireRefreshLock(ctx context.Context, redisClient *redis.Client, lockKey string, msg jetstream.Msg, deliveryCount uint64) (cleanup func(), shouldContinue bool) {
	lockAcquired, cleanupFunc, err := rediscore.AcquireRefreshLock(ctx, redisClient, lockKey)
	if err != nil {
		logs.Warn("failed to acquire refresh lock, acknowledging message", "error", err, "delivery_count", deliveryCount)
		natscore.AcknowledgeMessage(msg, "lock acquisition error", deliveryCount)
		return nil, false
	}
	if !lockAcquired {
		logs.Info("skipping refresh, another refresh in progress, acknowledging message", "delivery_count", deliveryCount)
		natscore.AcknowledgeMessage(msg, "lock already held", deliveryCount)
		return nil, false
	}
	// Lock acquired successfully - caller should defer cleanup()
	return cleanupFunc, true
}
