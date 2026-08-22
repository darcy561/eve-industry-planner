package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// DrainAccountStatsRebuildQueue is the worker entrypoint for the statistics
// rebuild queue.
//
// The task carries no payload: the queue itself names the work, so a pass is
// always "everything waiting" and there is nothing for a caller to scope.
//
// A pass that rebuilt some accounts and failed others returns nil. The failures
// keep their place in the queue and retry on the next pass, so returning an
// error would retry the accounts that already succeeded to no purpose — the
// count is recorded as a caveat instead.
func DrainAccountStatsRebuildQueue(ctx context.Context, _ *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	result, err := DrainAccountRebuildQueue(ctx, deps.Mongo, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("drain account rebuild queue: %w", err)
	}

	logs.InfoCtx(ctx, "account statistics rebuild queue drained",
		"component", "archivedjobs",
		"queued", result.Queued,
		"rebuilt", result.Rebuilt,
		"cleared", result.Cleared,
		"requeued", result.Requeued,
		"failed", result.Failed,
	)

	if result.Failed > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "account_rebuilds_failed",
			fmt.Sprintf("%d/%d account rebuilds failed and stay queued", result.Failed, result.Queued),
			map[string]any{"failed": result.Failed, "queued": result.Queued},
		)
	}

	return nil
}
