package archivedjobs

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const logComponent = "archivedjobs"

const (
	cronDrainAccountStatsRebuildQueueName = "cron.drainAccountStatsRebuildQueue"
	// Hourly at minute 30, off the hour so the drain does not start alongside
	// every other cron that fires on minute 0.
	cronDrainAccountStatsRebuildQueueSchedule = "30 * * * *"
)

// ScheduleDrainAccountStatsRebuildQueue publishes one drain task per tick.
//
// The queue names the work, so this fans out nothing and carries no payload: a
// single task drains every account waiting. That keeps the claim protocol — which
// decides whether an account re-queued mid-rebuild is cleared — in one place
// rather than spread across per-account tasks.
//
// Publishing unconditionally rather than checking the queue first costs one
// message an hour against a read of the same collection the worker reads anyway,
// and leaves the scheduler with no Mongo dependency to fail on.
func ScheduleDrainAccountStatsRebuildQueue(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	task := taskscore.DrainAccountStatsRebuildQueue
	sched.RegisterHandler(cronDrainAccountStatsRebuildQueueName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		logs.DebugCtx(ctx, "account statistics rebuild drain publishing", "component", logComponent, "subject", task.Subject)
		if err := eipnats.PublishTask(
			ctx,
			deps.NATS,
			task.Subject,
			task.Name,
			struct{}{},
			task.DefaultPriority,
		); err != nil {
			logs.ErrorCtx(ctx, "account statistics rebuild drain publish failed", "component", logComponent, "subject", task.Subject, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronDrainAccountStatsRebuildQueueSchedule, cronDrainAccountStatsRebuildQueueName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
