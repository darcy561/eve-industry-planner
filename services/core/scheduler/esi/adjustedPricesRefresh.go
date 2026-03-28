package esi

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronAdjustedPricesRefresh  = "cron.adjustedPricesRefresh"
	cronAdjustedPricesSchedule = "20 * * * *"
)

// ScheduleAdjustedPricesRefresh sets up a cron job for adjusted prices refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleAdjustedPricesRefresh(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	task := taskscore.RefreshAdjustedPrices
	sched.RegisterHandler(cronAdjustedPricesRefresh, func(ctx context.Context, data json.RawMessage) error {
		log.Debug("publishing adjusted prices refresh trigger", "subject", task.Subject)
		if err := natscore.PublishEmpty(jsContext, task.Subject, natsConn); err != nil {
			log.Error("failed to publish adjusted prices refresh trigger", "subject", task.Subject, "error", err)
			return err
		}
		log.Info("adjusted prices refresh triggered", "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronAdjustedPricesSchedule, cronAdjustedPricesRefresh); err != nil {
		return nil, err
	}
	return func() {}, nil
}
