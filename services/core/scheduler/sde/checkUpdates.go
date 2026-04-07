package sde

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
)

const schedulerLogComponent = "scheduler"

const (
	cronCheckSDEUpdatesName     = "cron.checkSDEUpdates"
	cronCheckSDEUpdatesSchedule = "0 17 * * *" // 17:00 daily (scheduler local time; typically UTC in containers)
)

// ScheduleCheckSDEUpdates schedules a daily job for Static Data Export update checks.
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleCheckSDEUpdates(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS

	task := taskscore.CheckSDEUpdates
	sched.RegisterHandler(cronCheckSDEUpdatesName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "publishing SDE update check trigger", "component", schedulerLogComponent, "subject", task.Subject)
		if err := natscore.PublishEmpty(ctx, jsContext, task.Subject, natsConn); err != nil {
			logs.ErrorCtx(ctx, "failed to publish SDE update check trigger", "component", schedulerLogComponent, "subject", task.Subject, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "SDE update check triggered", "component", schedulerLogComponent, "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronCheckSDEUpdatesSchedule, cronCheckSDEUpdatesName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
