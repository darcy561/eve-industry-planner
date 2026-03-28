package esi

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	natscore "eve-industry-planner/shared/core/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

const (
	cronMarketPricesCountName     = "cron.marketPricesCount"
	cronMarketPricesCountSchedule = "0 */4 * * *"
)

// ScheduleMarketPricesCount sets up a cron job to count market prices items (every 4 hours).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleMarketPricesCount(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS
	log := deps.Log

	task := taskscore.CountMarketPricesItems
	sched.RegisterHandler(cronMarketPricesCountName, func(ctx context.Context, data json.RawMessage) error {
		log.Debug("publishing market prices count trigger", "subject", task.Subject)
		if err := natscore.PublishEmpty(jsContext, task.Subject, natsConn); err != nil {
			log.Error("failed to publish market prices count trigger", "subject", task.Subject, "error", err)
			return err
		}
		log.Info("market prices count triggered", "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronMarketPricesCountSchedule, cronMarketPricesCountName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
