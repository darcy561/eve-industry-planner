package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// DeltaResult summarises one pass of delta application.
type DeltaResult struct {
	Added         int
	Removed       int
	TypesTouched  int
	BucketsPruned int64
}

// ApplyOwnerStatisticsDelta folds an owner's uncounted rows into its aggregates.
//
// The task carries no list of jobs. Its work is every row for the owner with no
// `contributedAt`, so the stamp that keeps a row from being counted twice is also
// what describes what is outstanding. Three properties follow: archiving twenty
// jobs is one task rather than twenty, a task that dies leaves its unreached rows
// still unstamped for the next run, and a row cannot be applied twice because it
// is stamped in the same call that applies it.
func ApplyOwnerStatisticsDelta(ctx context.Context, t *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	req, err := esitasks.UnmarshalTaskPayload[eipnats.RebuildOwnerStatisticsRequest](t)
	if err != nil {
		return fmt.Errorf("decode apply owner statistics delta payload: %w", err)
	}

	owner := models.StatsOwner{Kind: models.StatsOwnerKind(req.OwnerKind), ID: req.OwnerID}
	if err := owner.Validate(); err != nil {
		return fmt.Errorf("apply owner statistics delta: %w: %w", err, asynq.SkipRetry)
	}
	if owner.Kind != models.StatsOwnerAccount {
		return fmt.Errorf("owner kind %q has no archive to read: %w", owner.Kind, asynq.SkipRetry)
	}

	queued := eipmongo.QueuedOwner{Owner: owner, Work: eipmongo.StatsWorkDelta, Claim: req.Claim}
	result, cleared, err := applyOwnerDelta(ctx, deps.Mongo, queued, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("apply statistics delta: %w", err)
	}

	logs.InfoCtx(ctx, "owner statistics delta applied",
		"component", "archivedjobs",
		"owner_kind", owner.Kind,
		"added", result.Added,
		"removed", result.Removed,
		"types_touched", result.TypesTouched,
		"buckets_pruned", result.BucketsPruned,
		"cleared", cleared,
	)
	return nil
}

// applyOwnerDelta folds the owner's uncounted rows and clears its queue entry.
func applyOwnerDelta(ctx context.Context, mongo *eipmongo.Mongo, queued eipmongo.QueuedOwner, now time.Time) (DeltaResult, bool, error) {
	var out DeltaResult
	accountID := queued.Owner.ID

	added, err := mongo.LoadUncountedStatsRows(ctx, accountID)
	if err != nil {
		return out, false, fmt.Errorf("load uncounted rows: %w", err)
	}
	removed, err := mongo.LoadRevokedContributedRows(ctx, accountID)
	if err != nil {
		return out, false, fmt.Errorf("load revoked rows still counted: %w", err)
	}
	out.Added, out.Removed = len(added), len(removed)

	types := map[int]struct{}{}

	if len(added) > 0 {
		delta, ids := accumulate(added, false, types)
		if err := mongo.ApplyStatsDelta(ctx, accountID, delta, ids, now); err != nil {
			return out, false, err
		}
	}

	if len(removed) > 0 {
		// Removing is the same arithmetic negated, so the figures a row put in are
		// exactly what comes back out. The stamp is cleared rather than set, since
		// the row is no longer counted.
		delta, ids := accumulate(removed, true, types)
		if err := mongo.ApplyStatsDelta(ctx, accountID, delta, nil, now); err != nil {
			return out, false, err
		}
		if err := mongo.ClearContributedStamp(ctx, ids); err != nil {
			return out, false, fmt.Errorf("clear contribution stamp: %w", err)
		}
	}
	out.TypesTouched = len(types)

	// Marks cannot be incremented — a cheapest and a dearest do not move by
	// addition, and removing the cheapest leaves nothing in a counter to recover
	// the next one from — so each touched type's are recomputed from its rows.
	for typeID := range types {
		typeRows, terr := mongo.LoadTypeStatsRows(ctx, accountID, typeID)
		if terr != nil {
			return out, false, fmt.Errorf("load rows for type %d: %w", typeID, terr)
		}
		if merr := mongo.SetBuildHistoryMarks(ctx, accountID, typeID, archivestats.AccountBuildHistory(typeRows)); merr != nil {
			return out, false, fmt.Errorf("set marks for type %d: %w", typeID, merr)
		}
	}

	pruned, err := mongo.PruneEmptyBuckets(ctx, accountID)
	if err != nil {
		return out, false, fmt.Errorf("prune empty buckets: %w", err)
	}
	out.BucketsPruned = pruned

	cleared, err := mongo.ClearQueuedOwner(ctx, queued)
	if err != nil {
		return out, false, fmt.Errorf("clear queue entry: %w", err)
	}
	return out, cleared, nil
}

// accumulate folds a set of rows into one delta, negated when the rows are being
// taken back out, and records which item types it touched.
func accumulate(rows []models.ArchivedJobStats, negate bool, types map[int]struct{}) (models.StatsDelta, []string) {
	delta := models.StatsDelta{
		Buckets: map[models.StatsBucketKey]models.StatsBucketDelta{},
		Totals:  map[models.StatsTypeKey]models.StatsTypeDelta{},
	}
	ids := make([]string, 0, len(rows))

	for _, row := range rows {
		contribution := archivestats.ContributionOf(row)
		if negate {
			// A revoked row contributes nothing when folded, so the figures to
			// reverse are the ones it would contribute if it were not revoked.
			live := row
			live.Revoked = false
			contribution = archivestats.ContributionOf(live).Negated()
		}
		for key, bucket := range contribution.Buckets {
			held := delta.Buckets[key]
			held.Measures = held.Measures.Plus(bucket.Measures)
			held.Rows += bucket.Rows
			delta.Buckets[key] = held
		}
		for key, total := range contribution.Totals {
			held := delta.Totals[key]
			held.JobType = total.JobType
			held.Measures = held.Measures.Plus(total.Measures)
			held.SoldQty += total.SoldQty
			held.BuildRows += total.BuildRows
			delta.Totals[key] = held
			types[key.TypeID] = struct{}{}
		}
		ids = append(ids, row.ID)
	}
	return delta, ids
}
