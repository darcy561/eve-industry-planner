package archivedjobs

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronDrainAccountStatsRebuildQueueName = "cron.drainAccountStatsRebuildQueue"
	// Hourly, offset from the build stats fan-out on minute 0 so the two
	// archived-jobs crons do not contend for Mongo in the same minute.
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
		if err := natscore.PublishTask(
			ctx,
			deps.JSContext,
			task.Subject,
			task.Name,
			struct{}{},
			deps.NATS,
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
