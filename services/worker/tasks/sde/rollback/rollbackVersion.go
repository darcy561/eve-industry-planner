package rollback

import (
	"context"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"
	sdepublish "eve-industry-planner/worker/tasks/sde/publish"

	"github.com/hibiken/asynq"
)

// RollbackSDEVersion rolls live_data back to the most recent previous version.
func RollbackSDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}

	rollbackVersion, err := sdepublish.RollbackLive(ctx, backend, "")
	if err != nil {
		return err
	}

	if err := sdecore.WriteVersionLock(ctx, backend, sdecore.VersionLock{
		Version:     rollbackVersion.Version,
		BuildNumber: rollbackVersion.BuildNumber,
		LockedAt:    time.Now().UTC(),
		Source:      "rollbackSDEVersion",
		Reason:      "locked after rollback",
	}); err != nil {
		return fmt.Errorf("failed writing version lock after rollback: %w", err)
	}

	if err := sdepublish.PrunePreviousVersions(ctx, backend, sdecore.MaxPreviousVersions); err != nil {
		return err
	}

	logs.InfoCtx(ctx, "SDE rollback completed",
		"backend", backend.Kind(),
		"rolled_back_to_version", rollbackVersion.Version,
		"build_number", rollbackVersion.BuildNumber,
	)
	if deps != nil && deps.NATS != nil && rollbackVersion.BuildNumber > 0 {
		if err := eipnats.PublishSDEBuildUpdated(deps.NATS, rollbackVersion.BuildNumber, rollbackVersion.Version); err != nil {
			logs.WarnCtx(ctx, "failed to publish core SDE build update after rollback",
				"build_number", rollbackVersion.BuildNumber, "error", err)
		}
	}

	return nil
}
