package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// ReconcileResult reports one reconcile: what it wrote, and what it found wrong
// on the way.
type ReconcileResult struct {
	AccountID     string
	Rows          int
	Buckets       int
	Totals        int
	PrunedBuckets int64
	PrunedTotals  int64
	Counted       int
	Uncounted     int
	BucketDrift   archivestats.Drift
	TotalDrift    archivestats.Drift
}

// Drifted reports whether either collection disagreed with the rows.
func (r ReconcileResult) Drifted() bool {
	return r.BucketDrift.Any() || r.TotalDrift.Any()
}

// ReconcileAccountStatistics rewrites an account's aggregates from its stored
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
func ReconcileAccountStatistics(
	ctx context.Context,
	mongo *eipmongo.Mongo,
	accountID string,
	now time.Time,
) (ReconcileResult, error) {
	out := ReconcileResult{AccountID: accountID}
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return out, fmt.Errorf("accountID is required")
	}
	now = now.UTC()

	rows, err := mongo.LoadAccountArchivedJobStats(ctx, accountID)
	if err != nil {
		return out, fmt.Errorf("load statistics rows: %w", err)
	}
	out.Rows = len(rows)

	// A fold in flight is holding rows this reconcile is about to account for.
	// Bumping the claim is what tells it to stand down rather than adding them a
	// second time on top of what is written below.
	owner := models.AccountStatsOwner(accountID)
	if err := mongo.BumpOwnerClaim(ctx, owner); err != nil {
		return out, fmt.Errorf("invalidate work in flight: %w", err)
	}

	folded := foldAccountAggregates(accountID, rows)

	storedBuckets, err := mongo.LoadAccountTimelineMonths(ctx, accountID)
	if err != nil {
		return out, fmt.Errorf("load stored timeline months: %w", err)
	}
	storedTotals, err := mongo.LoadAccountProductionTotals(ctx, accountID, 0)
	if err != nil {
		return out, fmt.Errorf("load stored production totals: %w", err)
	}
	out.BucketDrift = archivestats.CompareBuckets(storedBuckets, folded.Buckets)
	out.TotalDrift = archivestats.CompareTotals(storedTotals, folded.Totals)

	written, err := writeAccountAggregates(ctx, mongo, folded)
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
