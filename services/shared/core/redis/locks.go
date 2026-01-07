package redis

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// AcquireRefreshLock attempts to acquire a distributed lock for refresh operations.
// Returns true if the lock was acquired, a cleanup function to release the lock, and any error.
// The lock has a 300-second TTL to prevent deadlocks if a worker crashes.
// If lock is not acquired, cleanup will be nil.
func AcquireRefreshLock(ctx context.Context, client *redis.Client, lockKey string) (bool, func(), error) {
	lockAcquired, err := client.SetNX(ctx, lockKey, time.Now().UnixMilli(), 300*time.Second).Result()
	if err != nil {
		return false, nil, err
	}
	if !lockAcquired {
		return false, nil, nil
	}

	cleanup := func() {
		_ = client.Del(ctx, lockKey).Err()
	}
	return true, cleanup, nil
}
