package maintenance

import (
	"context"
	"time"

	"eve-industry-planner/api/helper/auth"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// PruneExpiredAccountSessions opportunistically loads each account session object so helper-level pruning runs.
func PruneExpiredAccountSessions(ctx context.Context, _ *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Redis == nil {
		return nil
	}
	cursor := uint64(0)
	for {
		keys, next, err := deps.Redis.Scan(ctx, cursor, auth.AccountSessionsKeyPrefix+"*", 200).Result()
		if err != nil {
			return err
		}
		for _, key := range keys {
			accountID := key[len(auth.AccountSessionsKeyPrefix):]
			// Loading record applies pruneExpiredSessions and persists if needed.
			_, _ = auth.GetAccountSessionsRecord(ctx, deps.Redis, accountID)
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	// Small delay to avoid hammering Redis during tight scheduler loops.
	time.Sleep(100 * time.Millisecond)
	return nil
}

