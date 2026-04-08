package update

import (
	"context"
	"fmt"
	"os"
	"time"

	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"

	"github.com/hibiken/asynq"
)

// RebuildCurrentSDEVersion rebuilds the currently active SDE build in place.
// It replaces live_data atomically and archives the displaced snapshot with a versioned suffix.
func RebuildCurrentSDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdeshared.DefaultDataDir
	}

	rootVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading root version.json: %w", err)
	}
	if rootVersion == nil || rootVersion.BuildNumber <= 0 {
		return fmt.Errorf("cannot rebuild current SDE version without a valid current build_number")
	}

	versionResult := &sdeVersionCheckResult{
		DataDir:        dataDir,
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
		"data_dir", dataDir,
		"build_number", rootVersion.BuildNumber,
		"version", rootVersion.Version,
	)
	pushCoreSDEBuildUpdate(ctx, deps, rootVersion.BuildNumber, rootVersion.Version)
	return nil
}
