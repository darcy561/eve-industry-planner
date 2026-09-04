package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// RebuildOwnerStatistics recomputes one owner's statistics and clears its queue
// entry.
//
// The entry is cleared only if its claim still matches the one dispatched with
// the task, so an owner changed while this ran keeps its place and is rebuilt
// again rather than having the change erased by this rebuild's completion.
func RebuildOwnerStatistics(ctx context.Context, t *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	req, err := esitasks.UnmarshalTaskPayload[eipnats.RebuildOwnerStatisticsRequest](t)
	if err != nil {
		return fmt.Errorf("decode rebuild owner statistics payload: %w", err)
	}

	owner := models.StatsOwner{Kind: models.StatsOwnerKind(req.OwnerKind), ID: req.OwnerID}
	if err := owner.Validate(); err != nil {
		// Retrying cannot change a payload, so this fails once and stops rather
		// than occupying the queue until the retry ceiling.
		return fmt.Errorf("rebuild owner statistics: %w: %w", err, asynq.SkipRetry)
	}

	result, cleared, err := rebuildOwner(ctx, deps.Mongo, eipmongo.QueuedOwner{Owner: owner, Claim: req.Claim}, time.Now().UTC())
	if err != nil {
		return stopIfOutOfAttempts(ctx, deps.Mongo, owner, fmt.Errorf("rebuild %s statistics: %w", owner.Kind, err))
	}
	forgetFailuresIfStillQueued(ctx, deps.Mongo, owner, cleared)

	logs.InfoCtx(ctx, "owner statistics rebuilt",
		"component", "archivedjobs",
		"owner_kind", owner.Kind,
		"archived_jobs", result.ArchivedJobs,
		"stats_rows", result.StatsRows,
		"timeline_months", result.TimelineMonths,
		"production_totals", result.ProductionTotals,
		"skipped_jobs", result.SkippedJobs,
		"stale_rows", result.StaleRows,
		"cleared", cleared,
	)

	notifyStatisticsProcessed(ctx, deps.NATS, owner, time.Now().UTC())

	if !cleared {
		// Not a failure: the owner changed while this ran, so its entry stands and
		// the next dispatch rebuilds it again.
		logs.AttachHandlerCaveatCtx(ctx, "owner_requeued_during_rebuild",
			"owner changed during the rebuild and stays queued",
			map[string]any{"owner_kind": string(owner.Kind)},
		)
	}

	return nil
}

// rebuildOwner recomputes an owner and clears its entry on the claim it was
// dispatched with.
func rebuildOwner(ctx context.Context, mongo *eipmongo.Mongo, queued eipmongo.QueuedOwner, now time.Time) (AccountRebuildResult, bool, error) {
	if queued.Owner.Kind != models.StatsOwnerAccount {
		// Corporation and alliance archives are not built yet, so there is nothing
		// to read for them. Retrying will not change that, so it stops.
		return AccountRebuildResult{}, false, fmt.Errorf("owner kind %q has no archive to rebuild: %w", queued.Owner.Kind, asynq.SkipRetry)
	}

	result, err := RebuildAccountStatistics(ctx, mongo, queued.Owner.ID, now)
	if err != nil {
		return result, false, err
	}

	cleared, err := mongo.ClearQueuedOwner(ctx, queued)
	if err != nil {
		return result, false, fmt.Errorf("clear queue entry: %w", err)
	}
	return result, cleared, nil
}
