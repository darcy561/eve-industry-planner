package update

import (
	"context"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"strconv"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// ApplySDEVersion downloads/builds/persists a specific SDE build and locks the environment to it.
func ApplySDEVersion(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	req, err := esitasks.UnmarshalTaskPayload[eipnats.SDEApplyVersionRequest](task)
	if err != nil {
		return fmt.Errorf("failed to parse applySDEVersion payload: %w", err)
	}
	if req.BuildNumber <= 0 {
		return fmt.Errorf("invalid build_number: %d", req.BuildNumber)
	}

	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}
	rootVersion, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading root version.json: %w", err)
	}

	versionResult := &sdeVersionCheckResult{
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

	liveVersion, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading rebuilt root version.json: %w", err)
	}
	lockVersion := strconv.Itoa(req.BuildNumber)
	if liveVersion != nil && liveVersion.Version != "" {
		lockVersion = liveVersion.Version
	}

	if err := sdecore.WriteVersionLock(ctx, backend, sdecore.VersionLock{
		Version:     lockVersion,
		BuildNumber: req.BuildNumber,
		LockedAt:    time.Now().UTC(),
		Source:      "applySDEVersion",
		Reason:      "locked after applying explicit version",
	}); err != nil {
		return fmt.Errorf("failed writing version lock: %w", err)
	}

	logs.InfoCtx(ctx, "SDE apply version completed",
		"build_number", req.BuildNumber,
	)
	if liveVersion != nil {
		pushCoreSDEBuildUpdate(ctx, deps, liveVersion.BuildNumber, liveVersion.Version)
	}
	return nil
}
