package sde

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

const schedulerLogComponent = "scheduler"

const (
	cronCheckSDEUpdatesName     = "cron.checkSDEUpdates"
	cronCheckSDEUpdatesSchedule = "0 17 * * *" // 17:00 daily (scheduler local time; typically UTC in containers)
)

// ScheduleCheckSDEUpdates schedules a daily job for Static Data Export update checks.
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleCheckSDEUpdates(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	natsHandle := deps.NATS

	sched.RegisterHandler(cronCheckSDEUpdatesName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "publishing SDE update check trigger", "component", schedulerLogComponent)
		if err := eipnats.TriggerCheckSDEUpdates(ctx, natsHandle); err != nil {
			logs.ErrorCtx(ctx, "failed to publish SDE update check trigger", "component", schedulerLogComponent, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "SDE update check triggered", "component", schedulerLogComponent)
		return nil
	})
	if err := sched.ScheduleCronJob(cronCheckSDEUpdatesSchedule, cronCheckSDEUpdatesName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
