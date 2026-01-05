package tasks

import (
	"context"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"

	"github.com/redis/go-redis/v9"
)

// MessageInterface provides a minimal interface for NATS message acknowledgment.
// This avoids import cycles with the esi package.
type MessageInterface interface {
	Ack() error
}

// AcquireRefreshLock acquires a distributed lock to prevent concurrent refresh operations for the same resource.
// The lock is identified by lockKey (e.g., "esi:industry_systems:refresh_lock") and ensures only one refresh
// task processes data for that resource at a time. If another refresh is already in progress, this function
// acknowledges the message and returns false to prevent duplicate work.
//
// Returns the cleanup function and a boolean indicating if processing should continue.
// If cleanup is returned and shouldContinue is true, the caller must call defer cleanup() to release the lock.
// If shouldContinue is false, the message has been acknowledged (another refresh is in progress) and the caller should return.
func AcquireRefreshLock(ctx context.Context, redisClient *redis.Client, lockKey string, natsMessage MessageInterface, deliveryCount uint64) (cleanup func(), shouldContinue bool) {
	lockAcquired, cleanupFunc, err := rediscore.AcquireRefreshLock(ctx, redisClient, lockKey)
	if err != nil {
		logs.Warn("failed to acquire refresh lock, acknowledging message", "error", err, "delivery_count", deliveryCount)
		acknowledgeMessage(natsMessage, "lock acquisition error", deliveryCount)
		return nil, false
	}
	if !lockAcquired {
		logs.Info("skipping refresh, another refresh in progress, acknowledging message", "delivery_count", deliveryCount)
		acknowledgeMessage(natsMessage, "lock already held", deliveryCount)
		return nil, false
	}
	// Lock acquired successfully - caller should defer cleanup()
	return cleanupFunc, true
}

// acknowledgeMessage acknowledges a NATS message with appropriate logging.
func acknowledgeMessage(natsMessage MessageInterface, reason string, deliveryCount uint64) {
	if natsMessage != nil {
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message", "error", ackErr, "reason", reason)
		} else {
			logs.Info("message acknowledged", "reason", reason, "delivery_count", deliveryCount)
		}
	}
}

