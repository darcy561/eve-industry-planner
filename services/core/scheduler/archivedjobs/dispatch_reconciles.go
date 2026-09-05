package archivedjobs

import (
	"context"
	"encoding/json"

	"eve-industry-planner/core/scheduler/contract"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
)

// DispatchStatisticsReconciles publishes one rota tick.
//
// The rota decides who is due from stamps the reconciles themselves write, so
// this carries no payload and holds no Mongo dependency. How often it fires sets
// throughput; how long an owner may go unreconciled is the worker's window.
func DispatchStatisticsReconciles(deps contract.Dependencies, jobName string) contract.TaskHandler {
	return func(ctx context.Context, data json.RawMessage) error {
		_ = data
		logs.DebugCtx(ctx, "statistics reconcile rota publishing", "component", logComponent)
		if err := eipnats.PublishDispatchStatisticsReconciles(ctx, deps.NATS); err != nil {
			logs.ErrorCtx(ctx, "statistics reconcile rota publish failed", "component", logComponent, "error", err)
			return err
		}
		return nil
	}
}
