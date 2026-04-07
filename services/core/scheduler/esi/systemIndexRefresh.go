package esi

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
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
	task := taskscore.RefreshSystemIndexes
	sched.RegisterHandler(cronIndustrySystemsRefresh, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "publishing industry systems refresh trigger", "component", schedulerLogComponent, "subject", task.Subject)
		if err := natscore.PublishEmpty(ctx, jsContext, task.Subject, natsConn); err != nil {
			logs.ErrorCtx(ctx, "failed to publish industry systems refresh trigger", "component", schedulerLogComponent, "subject", task.Subject, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "industry systems refresh triggered", "component", schedulerLogComponent, "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronIndustrySystemsSchedule, cronIndustrySystemsRefresh); err != nil {
		return nil, err
	}
	return func() {}, nil
}
