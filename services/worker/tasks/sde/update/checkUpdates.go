package update

import (
	"context"
	"fmt"
	"os"
	"time"

	esitasks "eve-industry-planner/worker/tasks/esi"
	sdeshared "eve-industry-planner/worker/tasks/sde/shared"

	"eve-industry-planner/shared/shared/logs"

	"github.com/hibiken/asynq"
)

// stage function indirection for testability.
// Tests can replace these to validate workflow/ordering without running the real conversion pipeline.
var (
	stageVersionCheck   = runSDEVersionCheckStage
	stageDownload       = runSDEDownloadStage
	stageMapBuild       = runSDEMapBuildStage
	stageConversion     = runSDEConversionStage
	stageBlueprintsSync = runSDEBlueprintsMongoStageAsync
	stagePersist        = runSDEPersistStage
	stagePersistReplace = runSDEPersistStageReplaceCurrent
	stageRecipeDiff     = runSDENewRecipeItemsStage
	stagePrunePrevious  = runSDEPrunePreviousVersions
)

// CheckSDEUpdates runs the Static Data Export update check (download/compare/refresh as implemented).
// Triggered by the core scheduler via NATS with an empty payload.
func CheckSDEUpdates(ctx context.Context, task *asynq.Task, deps *esitasks.TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	_ = deps
	logs.Debug("SDE update check task received")

	dataDir := os.Getenv("SDE_DATA_DIR")
	if dataDir == "" {
		dataDir = sdeshared.DefaultDataDir
	}

	lock, err := sdeshared.ReadVersionLock(dataDir)
	if err != nil {
		return fmt.Errorf("failed reading SDE version lock: %w", err)
	}
	if lock != nil {
		logs.Info("SDE update skipped due to version lock",
			"data_dir", dataDir,
			"locked_build_number", lock.BuildNumber,
			"locked_version", lock.Version,
			"locked_at", lock.LockedAt,
		)
		return nil
	}

	versionResult, err := stageVersionCheck(ctx, dataDir)
	if err != nil {
		return err
	}

	return runSDEUpdatePipeline(ctx, deps, versionResult)
}

func runSDEUpdatePipeline(ctx context.Context, deps *esitasks.TaskDependencies, versionResult *sdeVersionCheckResult) error {
	return runSDEUpdatePipelineWithPersist(ctx, deps, versionResult, stagePersist, true)
}

func runSDEUpdatePipelineReplacingCurrent(ctx context.Context, deps *esitasks.TaskDependencies, versionResult *sdeVersionCheckResult) error {
	return runSDEUpdatePipelineWithPersist(ctx, deps, versionResult, stagePersistReplace, false)
}

func runSDEUpdatePipelineWithPersist(
	ctx context.Context,
	deps *esitasks.TaskDependencies,
	versionResult *sdeVersionCheckResult,
	persistStage func(*sdeVersionCheckResult, *sdeConversionResult) (*sdePersistResult, error),
	runPostPersistStages bool,
) error {
	downloadResult, err := stageDownload(ctx, versionResult)
	if err != nil {
		return err
	}

	mapBuildResult, err := stageMapBuild(downloadResult)
	if err != nil {
		return err
	}

	conversionResult, err := stageConversion(mapBuildResult)
	if err != nil {
		return err
	}

	// Stage 4b: async sync of recipeList into Mongo /blueprints by itemID.
	stageBlueprintsSync(ctx, conversionResult, deps)

	persistResult, err := persistStage(versionResult, conversionResult)
	if err != nil {
		return err
	}
	if !runPostPersistStages {
		return nil
	}

	// Stage 5: compare recipe list between previous and current versions.
	if err := stageRecipeDiff(ctx, persistResult, deps); err != nil {
		return err
	}

	// Stage 6: keep only the newest N previous versions.
	if persistResult != nil {
		if err := stagePrunePrevious(versionResult.DataDir); err != nil {
			return err
		}
	}

	return nil
}
