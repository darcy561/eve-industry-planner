package tasks

import (
	"context"
	"fmt"
	"net/http"
	"time"

	esitypes "eve-industry-planner/shared/core/esi/types"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/logs"

	"github.com/hibiken/asynq"
)

// RefreshSystemIndexes stores each solar system's industry cost indices,
// skipping the write entirely when the ETag says nothing changed.
func RefreshSystemIndexes(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "system indexes task received")

	lockKey := "esi:industry_systems:refresh_lock"
	cleanup, shouldContinue := rediscore.AcquireRefreshLockLogged(ctx, deps.Redis, lockKey)
	if !shouldContinue {
		return nil
	}
	defer cleanup()

	prevETag, err := rediscore.GetIndustrySystemsETag(ctx, deps.Redis)
	if err != nil {
		logs.WarnCtx(ctx, "failed to get previous ETag", "error", err)
	}

	start := time.Now()
	logs.DebugCtx(ctx, "System Indexes Refresh Started", "etag_used", prevETag)

	newETag, notModified, maxAge, err := streamIndustrySystems(ctx, deps.ESI, prevETag, func(system esitypes.SystemIndexes) error {
		return rediscore.SaveIndustrySystemIndex(ctx, deps.Redis, system.SolarSystemID, system)
	})
	if err != nil {
		return HandleStreamError(ctx, err, "system indexes refresh")
	}

	// A 304 carries a fresh max-age too, so the next refresh is rescheduled
	// whether or not the data changed.
	recordNextRefresh(ctx, deps.Redis, rediscore.DatasetIndustrySystems, maxAge)

	if notModified {
		logs.InfoCtx(ctx, "System Indexes Refresh Completed - Not Modified (ETag Match)")
		return nil
	}

	if err := rediscore.SaveIndustrySystemsETag(ctx, deps.Redis, newETag); err != nil {
		logs.ErrorCtx(ctx, "failed to save ETag", "error", err, "reason", "etag_save_error")
		return fmt.Errorf("failed to save ETag: %w", err)
	}

	if err := rediscore.SaveIndustrySystemsLastUpdated(ctx, deps.Redis, time.Now().UnixMilli()); err != nil {
		logs.WarnCtx(ctx, "failed to save last updated timestamp", "error", err, "reason", "last_updated_save_error")
		return fmt.Errorf("failed to save last updated timestamp: %w", err)
	}

	logs.InfoCtx(ctx, "System Indexes Refresh Complete", "duration_ms", time.Since(start).Milliseconds())
	return nil
}

// streamIndustrySystems walks ESI's system list and flattens each one as it
// decodes.
func streamIndustrySystems(
	ctx context.Context,
	client esiclient.API,
	etag string,
	onItem func(esitypes.SystemIndexes) error,
) (newETag string, notModified bool, maxAge time.Duration, err error) {
	if client == nil {
		return "", false, 0, fmt.Errorf("ESI client is nil")
	}

	stream, err := client.Stream(ctx, esiclient.Request{
		Method:      http.MethodGet,
		Path:        "/industry/systems/",
		Class:       esiclient.ClassBackground,
		IfNoneMatch: etag,
		Retry:       httpclient.DefaultRetry(),
	})
	if err != nil {
		return "", false, 0, err
	}
	defer stream.Body.Close()

	if stream.NotModified {
		return stream.ETag, true, stream.MaxAge, nil
	}
	if stream.Status != http.StatusOK {
		return "", false, 0, fmt.Errorf("ESI industry systems: unexpected status %d", stream.Status)
	}

	stamped := time.Now().UnixMilli()
	walk := func(system esiclient.IndustrySystem) error {
		return onItem(flattenCostIndices(system, stamped))
	}
	if err := httpclient.StreamJSON(stream.Body, walk); err != nil {
		return "", false, 0, err
	}
	return stream.ETag, false, stream.MaxAge, nil
}

// flattenCostIndices turns ESI's list of activities into the named fields the
// application stores. An activity ESI adds that nothing here knows about is
// ignored rather than failing the pass.
func flattenCostIndices(system esiclient.IndustrySystem, stamped int64) esitypes.SystemIndexes {
	out := esitypes.SystemIndexes{SolarSystemID: system.SolarSystemID, LastUpdated: stamped}
	for _, index := range system.CostIndices {
		switch index.Activity {
		case esiclient.ActivityManufacturing:
			out.Manufacturing = index.CostIndex
		case esiclient.ActivityResearchTime:
			out.ResearchTime = index.CostIndex
		case esiclient.ActivityResearchMaterial:
			out.ResearchMaterial = index.CostIndex
		case esiclient.ActivityCopying:
			out.Copying = index.CostIndex
		case esiclient.ActivityInvention:
			out.Invention = index.CostIndex
		case esiclient.ActivityReaction:
			out.Reaction = index.CostIndex
		}
	}
	return out
}
