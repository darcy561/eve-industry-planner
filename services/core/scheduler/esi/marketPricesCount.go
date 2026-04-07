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
	cronMarketPricesCountName     = "cron.marketPricesCount"
	cronMarketPricesCountSchedule = "0 */4 * * *"
)

// ScheduleMarketPricesCount sets up a cron job to count market prices items (every 4 hours).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleMarketPricesCount(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	jsContext := deps.JSContext
	natsConn := deps.NATS

	task := taskscore.CountMarketPricesItems
	sched.RegisterHandler(cronMarketPricesCountName, func(ctx context.Context, data json.RawMessage) error {
		logs.DebugCtx(ctx, "publishing market prices count trigger", "component", schedulerLogComponent, "subject", task.Subject)
		if err := natscore.PublishEmpty(ctx, jsContext, task.Subject, natsConn); err != nil {
			logs.ErrorCtx(ctx, "failed to publish market prices count trigger", "component", schedulerLogComponent, "subject", task.Subject, "error", err)
			return err
		}
		logs.InfoCtx(ctx, "market prices count triggered", "component", schedulerLogComponent, "subject", task.Subject)
		return nil
	})
	if err := sched.ScheduleCronJob(cronMarketPricesCountSchedule, cronMarketPricesCountName); err != nil {
		return nil, err
	}
	return func() {}, nil
}
