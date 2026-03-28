package esi

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronIndustrySystemsRefresh  = "cron.industrySystemsRefresh"
	cronIndustrySystemsSchedule = "50 * * * *"
)

// ScheduleIndustrySystemsRefresh sets up a cron job for industry systems refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleIndustrySystemsRefresh(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	task := taskscore.RefreshSystemIndexes
	sched.RegisterHandler(cronIndustrySystemsRefresh, func(ctx context.Context, data json.RawMessage) error {
		log.Debug("publishing industry systems refresh trigger", "subject", task.Subject)
		if err := natscore.PublishEmpty(jsContext, task.Subject, natsConn); err != nil {
			log.Error("failed to publish industry systems refresh trigger", "subject", task.Subject, "error", err)
			return err
		}
		log.Info("industry systems refresh triggered", "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronIndustrySystemsSchedule, cronIndustrySystemsRefresh); err != nil {
		return nil, err
	}
	return func() {}, nil
}
