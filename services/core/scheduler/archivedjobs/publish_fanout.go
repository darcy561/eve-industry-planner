package archivedjobs

import (
	"context"
	"errors"
	"fmt"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

// publishFanOutTasks publishes one worker task per non-empty key using publish(key). Logs and aggregates partial failures.
func publishFanOutTasks(ctx context.Context, deps contract.Dependencies, task taskscore.Task, keys []string, opLabel string, publish func(key string) error) error {
	var errs []error
	published := 0
	for _, k := range keys {
		if k == "" {
			continue
		}
		if err := publish(k); err != nil {
			logs.ErrorCtx(ctx, opLabel+": publish failed", "component", logComponent, "key", k, "error", err)
			errs = append(errs, err)
			continue
		}
		published++
	}

	logs.InfoCtx(ctx, opLabel+" complete",
		"component", logComponent,
		"candidates", len(keys),
		"tasks_published", published,
		"publish_errors", len(errs),
	)

	if len(errs) > 0 {
		return fmt.Errorf("%s: %d/%d publishes failed: %w", opLabel, len(errs), len(keys), errors.Join(errs...))
	}
	return nil
}
