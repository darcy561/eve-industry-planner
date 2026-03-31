package cli

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/shared"
)

// RunAsynqPurge removes all Asynq keys from Redis (pattern: asynq:*).
// Intended for operational recovery when queues/retries get stuck.
func RunAsynqPurge() error {
	ctx := context.Background()
	clients, err := shared.ConnectServices(ctx, shared.ServiceRedis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer runImmediateCleanups(clients.CleanupFns...)

	const (
		pattern   = "asynq:*"
		scanCount = int64(500)
	)

	var (
		cursor      uint64
		totalDeleted int64
	)

	for {
		keys, nextCursor, err := clients.Redis.Scan(ctx, cursor, pattern, scanCount).Result()
		if err != nil {
			return fmt.Errorf("failed scanning redis with pattern %q: %w", pattern, err)
		}

		if len(keys) > 0 {
			deleted, delErr := clients.Redis.Del(ctx, keys...).Result()
			if delErr != nil {
				return fmt.Errorf("failed deleting redis keys for pattern %q: %w", pattern, delErr)
			}
			totalDeleted += deleted
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}

	out := map[string]interface{}{
		"purged":       true,
		"pattern":      pattern,
		"keys_deleted": totalDeleted,
		"note":         "Asynq runtime keys may reappear immediately when worker processes are running",
	}

	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting asynq purge output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}

