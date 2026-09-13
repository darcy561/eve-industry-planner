package update

import (
	"context"
	objectstore "eve-industry-planner/shared/core/objectstore"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/worker/taskrun"
)

// RebuildCurrentSDEVersion rebuilds the currently active SDE build in place.
func RebuildCurrentSDEVersion(ctx context.Context, deps *taskrun.Dependencies) error {
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

	// Re-read rather than announcing rootVersion: a rebuild republishes the same
	// build under a new version label, so the copy read before the pipeline names
	// the build that was just replaced. A client told that version compares it
	// against what it already holds and does nothing.
	liveVersion, err := sdecore.ReadRootVersionJSON(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading rebuilt root version.json: %w", err)
	}
	if liveVersion == nil {
		return fmt.Errorf("no root version.json after rebuilding the current SDE version")
	}

	logs.InfoCtx(ctx, "SDE rebuild current version completed",
		"build_number", liveVersion.BuildNumber,
		"version", liveVersion.Version,
	)
	pushCoreSDEBuildUpdate(ctx, deps, liveVersion.BuildNumber, liveVersion.Version)
	return nil
}
