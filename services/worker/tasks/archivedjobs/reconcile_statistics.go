package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/statistics"
)

// ReconcileResult reports one reconcile: what it wrote, and what it found wrong
// on the way.
type ReconcileResult struct {
	Owner         models.Owner
	Rows          int
	Buckets       int
	Totals        int
	PrunedBuckets int64
	PrunedTotals  int64
	Counted       int
	Uncounted     int
	// Created counts rows built for archived jobs that had none.
	Created int
	// SkippedJobs counts archived jobs whose figures could not be computed, so
	// they still have no row and are offered again next time.
	SkippedJobs int
	BucketDrift statistics.Drift
	TotalDrift  statistics.Drift
}

// Drifted reports whether either collection disagreed with the rows.
func (r ReconcileResult) Drifted() bool {
	return r.BucketDrift.Any() || r.TotalDrift.Any()
}

// ReconcileStatistics rewrites an owner's aggregates from its stored
// rows, and reports what they disagreed about first.
//
// It does not re-derive anything from job documents: rows are written whole,
// once per job, and never incremented, so they stay authoritative for every
// aggregate above them while an aggregate can drift by a `$inc` that never
// landed or landed twice. That is why repair reads rows and why it is so much
// cheaper than a rebuild.
//
// The write is unconditional. Comparing happens only to report, so a fault in
// the comparison cannot stop the correction — the alternative, "detect then
// queue a repair", is silent exactly when detection is the broken part.
func ReconcileStatistics(
	ctx context.Context,
	mongo *eipmongo.Mongo,
	owner models.Owner,
	now time.Time,
) (ReconcileResult, error) {
	out := ReconcileResult{Owner: owner}
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return out, err
	}
	now = now.UTC()

	rows, err := mongo.LoadArchivedJobStats(ctx, owner)
	if err != nil {
		return out, fmt.Errorf("load statistics rows: %w", err)
	}

	// A job archived while nothing folded for this owner has no row, and rows are
	// what everything below reads. Building them here is what makes the rota a
	// backstop for a missed row write rather than only for arithmetic that
	// drifted. The rows just read say which jobs already have one.
	fresh, err := writeRowsForNewlyArchivedJobs(ctx, mongo, owner, rows, now)
	if err != nil {
		return out, err
	}
	rows = append(rows, fresh.Rows...)
	out.Created, out.SkippedJobs = len(fresh.Rows), fresh.Skipped
	out.Rows = len(rows)

	// A fold in flight is holding rows this reconcile is about to account for.
	// Bumping the claim is what tells it to stand down rather than adding them a
	// second time on top of what is written below.
	if err := mongo.BumpOwnerClaim(ctx, owner); err != nil {
		return out, fmt.Errorf("invalidate work in flight: %w", err)
	}

	folded := foldAggregates(owner, rows)

	storedBuckets, err := mongo.LoadTimelineMonths(ctx, owner)
	if err != nil {
		return out, fmt.Errorf("load stored timeline months: %w", err)
	}
	storedTotals, err := mongo.LoadProductionTotals(ctx, owner, 0)
	if err != nil {
		return out, fmt.Errorf("load stored production totals: %w", err)
	}
	out.BucketDrift = statistics.CompareBuckets(storedBuckets, folded.Buckets)
	out.TotalDrift = statistics.CompareTotals(storedTotals, folded.Totals)

	written, err := writeAggregates(ctx, mongo, folded)
	if err != nil {
		return out, err
	}
	out.Buckets, out.Totals = written.Buckets, written.Totals
	out.PrunedBuckets, out.PrunedTotals = written.PrunedBuckets, written.PrunedTotals

	// Every live row is now in the aggregates and every revoked one is not, so
	// the stamps that describe outstanding work have to say the same. Leaving a
	// live row unstamped would offer it to the next fold as if it were new.
	counted, uncounted := partitionRowIDs(rows)
	if err := mongo.StampContributed(ctx, counted, now); err != nil {
		return out, fmt.Errorf("stamp counted rows: %w", err)
	}
	if err := mongo.ClearContributedStamp(ctx, uncounted); err != nil {
		return out, fmt.Errorf("clear stamps on revoked rows: %w", err)
	}
	out.Counted, out.Uncounted = len(counted), len(uncounted)

	if err := mongo.StampOwnerReconciled(ctx, owner, now); err != nil {
		return out, fmt.Errorf("stamp owner reconciled: %w", err)
	}
	return out, nil
}

// partitionRowIDs splits rows into those the fold counted and those it skipped.
func partitionRowIDs(rows []models.ArchivedJobStats) (counted, uncounted []string) {
	for _, row := range rows {
		if row.Revoked {
			uncounted = append(uncounted, row.ID)
			continue
		}
		counted = append(counted, row.ID)
	}
	return counted, uncounted
}
