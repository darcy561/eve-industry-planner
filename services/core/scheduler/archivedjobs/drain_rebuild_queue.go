package archivedjobs

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

const logComponent = "archivedjobs"

const (
	cronDrainAccountStatsRebuildQueueName = "cron.drainAccountStatsRebuildQueue"
	// Every two minutes. The tick only dispatches, so it is cheap, and a tick that
	// fails to publish costs one interval rather than an hour. How long an owner
	// actually waits is the debounce the worker applies, not this.
	cronDrainAccountStatsRebuildQueueSchedule = "*/2 * * * *"
)

// ScheduleDrainAccountStatsRebuildQueue publishes one dispatch task per tick.
//
// The queue names the work, so this carries no payload. The task it publishes
// reads the queue and fans out one rebuild per owner; the scheduler holds no
// Mongo dependency to fail on, and publishing unconditionally rather than
// checking the queue first costs one message against a read the worker makes
// anyway.
func ScheduleDrainAccountStatsRebuildQueue(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	sched.RegisterHandler(cronDrainAccountStatsRebuildQueueName, func(ctx context.Context, data json.RawMessage) error {
		_ = data
		logs.DebugCtx(ctx, "account statistics rebuild drain publishing", "component", logComponent)
		if err := eipnats.PublishDrainAccountStatsRebuildQueue(ctx, deps.NATS); err != nil {
			logs.ErrorCtx(ctx, "account statistics rebuild drain publish failed", "component", logComponent, "error", err)
			return err
		}
		return nil
	})
	if err := sched.ScheduleCronJob(cronDrainAccountStatsRebuildQueueSchedule, cronDrainAccountStatsRebuildQueueName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
