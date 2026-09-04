package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"
)

// reconcileWindow is how long an owner may go between reconciles.
//
// Nothing else has to agree with it. The rota is due-time based, so the tick
// interval decides throughput and this decides coverage; changing either alone
// is safe.
const reconcileWindow = 24 * time.Hour

// reconcileDispatchCap bounds one tick's fan-out, so a first run — where every
// owner is due at once — spreads over several ticks instead of queueing the
// whole population in one.
const reconcileDispatchCap = 50

// ReconcileOwnerStatistics rewrites one owner's aggregates from its stored rows.
func ReconcileOwnerStatistics(ctx context.Context, req eipnats.ReconcileOwnerStatisticsRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}

	owner := models.StatsOwner{Kind: models.StatsOwnerKind(req.OwnerKind), ID: req.OwnerID}
	if err := owner.Validate(); err != nil {
		return fmt.Errorf("reconcile owner statistics: %w: %w", err, eipnats.Terminate("a request cannot be corrected by retrying it"))
	}
	if owner.Kind != models.StatsOwnerAccount {
		return fmt.Errorf("owner kind %q has no rows to reconcile: %w", owner.Kind, eipnats.Terminate("no archive for this owner kind"))
	}

	result, err := ReconcileAccountStatistics(ctx, deps.Mongo, owner.ID, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("reconcile %s statistics: %w", owner.Kind, err)
	}

	logs.InfoCtx(ctx, "owner statistics reconciled",
		"component", "archivedjobs",
		"owner_kind", owner.Kind,
		"rows", result.Rows,
		"created", result.Created,
		"skipped_jobs", result.SkippedJobs,
		"timeline_months", result.Buckets,
		"production_totals", result.Totals,
		"pruned_buckets", result.PrunedBuckets,
		"pruned_totals", result.PrunedTotals,
	)

	if result.Drifted() {
		notifyStatisticsProcessed(ctx, deps.NATS, owner, time.Now().UTC())

		// The aggregates have already been corrected. This says a delta went
		// wrong, which is the only way stored figures can disagree with the rows
		// they were folded from.
		logs.WarnCtx(ctx, "statistics drift corrected",
			"component", "archivedjobs",
			"owner_kind", owner.Kind,
			"buckets_missing", result.BucketDrift.Missing,
			"buckets_extra", result.BucketDrift.Extra,
			"buckets_counts_off", result.BucketDrift.CountsOff,
			"buckets_money_off", result.BucketDrift.MoneyOff,
			"totals_missing", result.TotalDrift.Missing,
			"totals_extra", result.TotalDrift.Extra,
			"totals_counts_off", result.TotalDrift.CountsOff,
			"totals_money_off", result.TotalDrift.MoneyOff,
			"worst_gap", max(result.BucketDrift.WorstGap, result.TotalDrift.WorstGap),
		)
	}
	return nil
}

// ReconcileDispatchResult summarises one pass over the rota.
type ReconcileDispatchResult struct {
	Due        int
	Dispatched int
	Failed     int
}

// DispatchStatisticsReconciles publishes a reconcile for every owner whose turn
// has come round.
func DispatchStatisticsReconciles(ctx context.Context, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if deps.NATS == nil {
		return fmt.Errorf("nats client is required")
	}

	result, err := DispatchDueReconciles(ctx, deps.Mongo, deps.NATS, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("dispatch due reconciles: %w", err)
	}

	logs.InfoCtx(ctx, "statistics reconciles dispatched",
		"component", "archivedjobs",
		"due", result.Due,
		"dispatched", result.Dispatched,
		"failed", result.Failed,
	)
	return nil
}

// DispatchDueReconciles publishes one reconcile task per owner that is due.
//
// An owner that fails to publish keeps its old stamp, so it is still due on the
// next tick — the stamp is only written by a reconcile that ran.
func DispatchDueReconciles(ctx context.Context, mongo *eipmongo.Mongo, nats *eipnats.NATS, now time.Time) (ReconcileDispatchResult, error) {
	var out ReconcileDispatchResult
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if nats == nil {
		return out, fmt.Errorf("nats handle is required")
	}

	due, err := mongo.OwnersDueForReconcile(ctx, now.Add(-reconcileWindow), reconcileDispatchCap)
	if err != nil {
		return out, fmt.Errorf("list owners due: %w", err)
	}
	out.Due = len(due)

	for _, owner := range due {
		if err := ctx.Err(); err != nil {
			break
		}
		if err := eipnats.PublishReconcileOwnerStatistics(ctx, nats, string(owner.Kind), owner.ID); err != nil {
			out.Failed++
			logs.WarnCtx(ctx, "statistics reconcile dispatch failed",
				"component", "archivedjobs", "owner_kind", owner.Kind, "error", err)
			continue
		}
		out.Dispatched++
	}
	return out, nil
}
