package update

import (
	"context"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// RebuildCurrentSDEVersion rebuilds the currently active SDE build in place.
func RebuildCurrentSDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}
	rootVersion, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading root version.json: %w", err)
	}
	if rootVersion == nil || rootVersion.BuildNumber <= 0 {
		return fmt.Errorf("cannot rebuild current SDE version without a valid current build_number")
	}

	versionResult := &sdeVersionCheckResult{
		CurrentVersion: rootVersion.Version,
		CurrentBuild:   rootVersion.BuildNumber,
		LatestBuild:    rootVersion.BuildNumber,
		LatestRelease:  rootVersion.ReleaseDate,
		LatestBuildInfo: &latestBuildInfo{
			Key:         rootVersion.Key,
			BuildNumber: rootVersion.BuildNumber,
			ReleaseDate: rootVersion.ReleaseDate,
			DownloadURL: buildJSONDataURL(rootVersion.BuildNumber),
		},
		NeedsUpdate: true,
		HasCurrent:  true,
	}

	if err := runSDEUpdatePipelineReplacingCurrent(ctx, deps, versionResult); err != nil {
		return err
	}

	logs.InfoCtx(ctx, "SDE rebuild current version completed",
		"build_number", rootVersion.BuildNumber,
		"version", rootVersion.Version,
	)
	pushCoreSDEBuildUpdate(ctx, deps, rootVersion.BuildNumber, rootVersion.Version)
	return nil
}
