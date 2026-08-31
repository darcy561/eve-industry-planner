package esi

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronAdjustedPricesRefresh  = "cron.adjustedPricesRefresh"
	cronAdjustedPricesSchedule = "20 * * * *"
)

// ScheduleAdjustedPricesRefresh sets up a cron job for adjusted prices refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleAdjustedPricesRefresh(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	natsHandle := deps.NATS
	task := taskscore.RefreshAdjustedPrices
	sched.RegisterHandler(cronAdjustedPricesRefresh, func(ctx context.Context, data json.RawMessage) error {
		publish := func(publishCtx context.Context) error {
			logs.DebugCtx(publishCtx, "publishing adjusted prices refresh trigger", "component", schedulerLogComponent, "subject", task.Subject)
			if err := eipnats.PublishEmpty(publishCtx, natsHandle, task.Subject); err != nil {
				logs.ErrorCtx(publishCtx, "failed to publish adjusted prices refresh trigger", "component", schedulerLogComponent, "subject", task.Subject, "error", err)
				return err
			}
			logs.InfoCtx(publishCtx, "adjusted prices refresh triggered", "component", schedulerLogComponent, "subject", task.Subject)
			return nil
		}
		if deferTaskPublicationUntilAfterDowntime(ctx, task.Name, task.Subject, publish) {
			return nil
		}
		return publish(ctx)
	})
	if err := sched.ScheduleCronJob(cronAdjustedPricesSchedule, cronAdjustedPricesRefresh); err != nil {
		return nil, err
	}
	return func() {}, nil
}
