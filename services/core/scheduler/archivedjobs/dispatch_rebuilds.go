package archivedjobs

import (
	"context"
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
)

const logComponent = "archivedjobs"

// ScheduleDispatchStatisticsRebuilds publishes one dispatch task per tick.
//
// The queue names the work, so this carries no payload. The task it publishes
// reads the queue and fans out one rebuild per owner; the scheduler holds no
// Mongo dependency to fail on, and publishing unconditionally rather than
// checking the queue first costs one message against a read the worker makes
// anyway.
func DispatchStatisticsRebuilds(deps contract.Dependencies, jobName string) contract.TaskHandler {
	return func(ctx context.Context, data json.RawMessage) error {
		_ = data
		logs.DebugCtx(ctx, "account statistics rebuild drain publishing", "component", logComponent)
		if err := eipnats.PublishDispatchStatisticsRebuilds(ctx, deps.NATS, eipnats.DrainRebuildQueueRequest{}); err != nil {
			logs.ErrorCtx(ctx, "account statistics rebuild drain publish failed", "component", logComponent, "error", err)
			return err
		}
		return nil
	}
}
