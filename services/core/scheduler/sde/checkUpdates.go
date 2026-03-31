package sde

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronCheckSDEUpdatesName     = "cron.checkSDEUpdates"
	cronCheckSDEUpdatesSchedule = "0 17 * * *" // 17:00 daily (scheduler local time; typically UTC in containers)
)

// ScheduleCheckSDEUpdates schedules a daily job for Static Data Export update checks.
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleCheckSDEUpdates(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	task := taskscore.CheckSDEUpdates
	sched.RegisterHandler(cronCheckSDEUpdatesName, func(ctx context.Context, data json.RawMessage) error {
		log.Debug("publishing SDE update check trigger", "subject", task.Subject)
		if err := natscore.PublishEmpty(jsContext, task.Subject, natsConn); err != nil {
			log.Error("failed to publish SDE update check trigger", "subject", task.Subject, "error", err)
			return err
		}
		log.Info("SDE update check triggered", "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronCheckSDEUpdatesSchedule, cronCheckSDEUpdatesName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
