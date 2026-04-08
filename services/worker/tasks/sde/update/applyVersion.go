package update

import (
	"context"
	"fmt"
	"os"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	esitasks "eve-industry-planner/worker/tasks/esi"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"

	"github.com/hibiken/asynq"
)

// ApplySDEVersion downloads/builds/persists a specific SDE build and locks the environment to it.
func ApplySDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	req, err := esitasks.UnmarshalTaskPayload[natscore.SDEApplyVersionRequest](task)
	if err != nil {
		return fmt.Errorf("failed to parse applySDEVersion payload: %w", err)
	}
	if req.BuildNumber <= 0 {
		return fmt.Errorf("invalid build_number: %d", req.BuildNumber)
	}

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdeshared.DefaultDataDir
	}

	rootVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading root version.json: %w", err)
	}

	versionResult := &sdeVersionCheckResult{
		DataDir:         dataDir,
		CurrentVersion:  "none",
		LatestBuild:     req.BuildNumber,
		LatestRelease:   "",
		LatestBuildInfo: &latestBuildInfo{Key: "sde", BuildNumber: req.BuildNumber, DownloadURL: buildJSONDataURL(req.BuildNumber)},
		NeedsUpdate:     true,
		HasCurrent:      false,
	}
	if rootVersion != nil {
		versionResult.HasCurrent = true
		versionResult.CurrentBuild = rootVersion.BuildNumber
		versionResult.CurrentVersion = rootVersion.Version
	}

	if err := runSDEUpdatePipeline(ctx, deps, versionResult); err != nil {
		return err
	}

	liveVersion, err := sdeshared.ReadRootVersionJSON(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading rebuilt root version.json: %w", err)
	}
	lockVersion := sdeshared.IntToString(req.BuildNumber)
	if liveVersion != nil && liveVersion.Version != "" {
		lockVersion = liveVersion.Version
	}

	if err := sdeshared.WriteVersionLock(dataDir, sdeshared.VersionLock{
		Version:     lockVersion,
		BuildNumber: req.BuildNumber,
		LockedAt:    time.Now().UTC(),
		Source:      "applySDEVersion",
		Reason:      "locked after applying explicit version",
	}); err != nil {
		return fmt.Errorf("failed writing version lock: %w", err)
	}

	logs.InfoCtx(ctx, "SDE apply version completed",
		"data_dir", dataDir,
		"build_number", req.BuildNumber,
	)
	if liveVersion != nil {
		pushCoreSDEBuildUpdate(ctx, deps, liveVersion.BuildNumber, liveVersion.Version)
	}
	return nil
}
