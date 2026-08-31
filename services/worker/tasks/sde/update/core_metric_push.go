package update

import (
	"context"
	"encoding/json"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"
)

func pushCoreSDEBuildUpdate(ctx context.Context, deps *esitasks.TaskDependencies, build int, version string) {
	if deps == nil || deps.NATS == nil || build <= 0 {
		return
	}
	payload, err := json.Marshal(eipnats.SDECurrentBuildUpdate{BuildNumber: build, Version: version})
	if err != nil {
		return
	}
	if err := deps.NATS.Conn().Publish(eipnats.SubjectCoreSDEBuildUpdated, payload); err != nil {
		logs.WarnCtx(ctx, "failed to publish core SDE build update", "build_number", build, "error", err)
	}
}
