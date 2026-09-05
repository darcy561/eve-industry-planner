package esi

import (
	"context"
	"encoding/json"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// ScheduleAdjustedPricesRefresh sets up a cron job for adjusted prices refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func AdjustedPricesRefresh(deps contract.Dependencies, jobName string) contract.TaskHandler {
	natsHandle := deps.NATS
	esi := deps.ESI
	redisClient := deps.Redis
	return func(ctx context.Context, data json.RawMessage) error {
		publish := func(publishCtx context.Context) error {
			logs.DebugCtx(publishCtx, "publishing adjusted prices refresh trigger", "component", schedulerLogComponent)
			if err := eipnats.TriggerRefreshAdjustedPrices(publishCtx, natsHandle); err != nil {
				logs.ErrorCtx(publishCtx, "failed to publish adjusted prices refresh trigger", "component", schedulerLogComponent, "error", err)
				return err
			}
			logs.InfoCtx(publishCtx, "adjusted prices refresh triggered", "component", schedulerLogComponent)
			return nil
		}
		if deferred, err := DeferPublicationUntilAfterDowntime(ctx, natsHandle, jobName, esi); err != nil || deferred {
			return err
		}
		if deferred, err := DeferPublicationUntilStale(ctx, natsHandle, jobName, rediscore.DatasetMarketPrices, redisClient, time.Now()); err != nil || deferred {
			return err
		}
		return publish(ctx)
	}
}
