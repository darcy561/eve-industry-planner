package esi

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

// ScheduleIndustrySystemsRefresh sets up a cron job for industry systems refresh (hourly).
// When the cron fires, this handler runs and publishes to the worker task's NATS subject.
func IndustrySystemsRefresh(deps contract.Dependencies, jobName string) contract.TaskHandler {
	natsHandle := deps.NATS
	return func(ctx context.Context, data json.RawMessage) error {
		publish := func(publishCtx context.Context) error {
			logs.DebugCtx(publishCtx, "publishing industry systems refresh trigger", "component", schedulerLogComponent)
			if err := eipnats.TriggerRefreshSystemIndexes(publishCtx, natsHandle); err != nil {
				logs.ErrorCtx(publishCtx, "failed to publish industry systems refresh trigger", "component", schedulerLogComponent, "error", err)
				return err
			}
			logs.InfoCtx(publishCtx, "industry systems refresh triggered", "component", schedulerLogComponent)
			return nil
		}
		if deferred, err := DeferPublicationUntilAfterDowntime(ctx, natsHandle, jobName, time.Now()); err != nil || deferred {
			return err
		}
		return publish(ctx)
	}
}
