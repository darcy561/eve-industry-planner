package esi

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

const (
	cronAdjustedPricesRefresh  = "cron.adjustedPricesRefresh"
	cronAdjustedPricesSchedule = "20 * * * *"
)

// ScheduleAdjustedPricesRefresh sets up a cron job for adjusted prices refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func ScheduleAdjustedPricesRefresh(deps contract.Dependencies, sched contract.Scheduler) (func(), error) {
	natsHandle := deps.NATS
	sched.RegisterHandler(cronAdjustedPricesRefresh, func(ctx context.Context, data json.RawMessage) error {
		publish := func(publishCtx context.Context) error {
			logs.DebugCtx(publishCtx, "publishing adjusted prices refresh trigger", "component", schedulerLogComponent)
			if err := eipnats.TriggerRefreshAdjustedPrices(publishCtx, natsHandle); err != nil {
				logs.ErrorCtx(publishCtx, "failed to publish adjusted prices refresh trigger", "component", schedulerLogComponent, "error", err)
				return err
			}
			logs.InfoCtx(publishCtx, "adjusted prices refresh triggered", "component", schedulerLogComponent)
			return nil
		}
		if deferred, err := DeferPublicationUntilAfterDowntime(ctx, natsHandle, cronAdjustedPricesRefresh, time.Now()); err != nil || deferred {
			return err
		}
		return publish(ctx)
	})
	if err := sched.ScheduleCronJob(cronAdjustedPricesSchedule, cronAdjustedPricesRefresh); err != nil {
		return nil, err
	}
	return func() {}, nil
}
