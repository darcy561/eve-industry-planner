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

	logs.DebugCtx(ctx, "SDE update check task received")

	backend, err := objectstore.OpenStaticData(ctx)
	if err != nil {
		return fmt.Errorf("sde store: %w", err)
	}
	lock, err := sdecore.ReadVersionLock(ctx, backend)
	if err != nil {
		return fmt.Errorf("failed reading SDE version lock: %w", err)
	}
	if lock != nil {
		logs.InfoCtx(ctx, "SDE update skipped due to version lock",
			"backend", backend.Kind(),
			"locked_build_number", lock.BuildNumber,
			"locked_version", lock.Version,
			"locked_at", lock.LockedAt,
		)
		return nil
	}

	versionResult, err := stageVersionCheck(ctx)
	if err != nil {
		return err
	}

	if err := runSDEUpdatePipeline(ctx, deps, versionResult); err != nil {
		return err
	}
	if v, err := sdecore.ReadRootVersionJSON(ctx, backend); err == nil && v != nil {
		pushCoreSDEBuildUpdate(ctx, deps, v.BuildNumber, v.Version)
	}
	return nil
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
		if err := stagePrunePrevious(); err != nil {
			return err
		}
	}

	return nil
}
