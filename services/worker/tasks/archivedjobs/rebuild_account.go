package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// AccountRebuildResult reports what one rebuild produced, for logging and for the
// drain to summarise a pass.
type AccountRebuildResult struct {
	AccountID      string
	ArchivedJobs   int
	StatsRows      int
	TimelineMonths int
	RevokedRows    int64
	PrunedBuckets  int64
	// ProductionTotals counts the lifetime per-item aggregates written.
	ProductionTotals int
	// PrunedTotals counts item types the account no longer has any job for.
	PrunedTotals int64
	// SkippedJobs counts archived jobs whose snapshot could not be computed. They
	// are absent from the totals, so a non-zero count means the account's figures
	// are incomplete rather than wrong.
	SkippedJobs int
}

// rebuildUpsertBatch bounds one bulk write. Large enough that a typical account
// is a single round trip, small enough that an outlier does not build a request
// Mongo rejects.
const rebuildUpsertBatch = 200

// RebuildAccountStatistics recomputes an account's statistics from its archived
// jobs, wholesale.
//
// Wholesale rather than incremental because the rebuild queue records only that
// an account changed, not which jobs — and because recomputing everything is
// idempotent, which is what lets a rebuild be retried or run concurrently with a
// re-queue without corrupting totals.
//
// Order matters. Rows and buckets are written before anything is removed, so a
// reader that arrives mid-rebuild sees the previous complete set or the new
// complete set, never a gap where a month has been pruned and not yet rewritten.
func RebuildAccountStatistics(
	ctx context.Context,
	mongo *eipmongo.Mongo,
	accountID string,
	now time.Time,
) (AccountRebuildResult, error) {
	out := AccountRebuildResult{AccountID: accountID}
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if accountID == "" {
		return out, fmt.Errorf("accountID is required")
	}
	now = now.UTC()

	jobs, err := mongo.LoadAccountArchivedJobs(ctx, accountID)
	if err != nil {
		return out, fmt.Errorf("load archived jobs: %w", err)
	}
	out.ArchivedJobs = len(jobs)

	rows, keepRowIDs, skipped := buildAccountRows(jobs, now)
	out.StatsRows = len(rows)
	out.SkippedJobs = skipped

	rowItems := make([]eipmongo.StructUpsertItem, 0, len(rows))
	for _, row := range rows {
		rowItems = append(rowItems, eipmongo.StructUpsertItem{DocID: row.ID, Value: row})
	}

	if len(rowItems) > 0 {
		if _, err := mongo.ArchivedJobStats.UpsertStructsPreservingMetaBulk(ctx, rowItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert statistics rows: %w", err)
		}
	}

	buckets := archivestats.AccountBuckets(accountID, rows)
	bucketItems := make([]eipmongo.StructUpsertItem, 0, len(buckets))
	keepBucketIDs := make([]string, 0, len(buckets))
	for _, bucket := range buckets {
		bucketItems = append(bucketItems, eipmongo.StructUpsertItem{DocID: bucket.ID, Value: bucket})
		keepBucketIDs = append(keepBucketIDs, bucket.ID)
	}
	out.TimelineMonths = len(buckets)

	if len(bucketItems) > 0 {
		if _, err := mongo.AccountTimelineMonths.UpsertStructsPreservingMetaBulk(ctx, bucketItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert timeline months: %w", err)
		}
	}

	// Lifetime totals per item type, the documents the totals read serves.
	// Derived from the same rows rather than incremented per job by a second
	// worker, so a rebuild cannot disagree with the timeline it was built beside.
	totals := archivestats.AccountProductionTotals(accountID, rows)
	totalItems := make([]eipmongo.StructUpsertItem, 0, len(totals))
	keepTotalIDs := make([]string, 0, len(totals))
	for _, total := range totals {
		totalItems = append(totalItems, eipmongo.StructUpsertItem{DocID: total.ID, Value: total})
		keepTotalIDs = append(keepTotalIDs, total.ID)
	}
	out.ProductionTotals = len(totals)

	if len(totalItems) > 0 {
		if _, err := mongo.AccountProductionTotals.UpsertStructsPreservingMetaBulk(ctx, totalItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert production totals: %w", err)
		}
	}

	// Anything the rebuild did not produce describes a job that is no longer
	// archived, or a month that no longer has activity.
	revoked, err := mongo.RevokeAccountArchivedJobStats(ctx, accountID, keepRowIDs, now)
	if err != nil {
		return out, fmt.Errorf("revoke removed statistics rows: %w", err)
	}
	out.RevokedRows = revoked

	pruned, err := mongo.PruneAccountTimelineMonths(ctx, accountID, keepBucketIDs)
	if err != nil {
		return out, fmt.Errorf("prune timeline months: %w", err)
	}
	out.PrunedBuckets = pruned

	prunedTotals, err := mongo.PruneAccountProductionTotals(ctx, accountID, keepTotalIDs)
	if err != nil {
		return out, fmt.Errorf("prune production totals: %w", err)
	}
	out.PrunedTotals = prunedTotals

	return out, nil
}

// buildAccountRows reduces an account's archived jobs to the rows to write, and
// the row ids the rebuild must not revoke.
//
// A job whose snapshot cannot be computed is skipped but its id is still kept:
// the job is still archived, so revoking its existing row would record it as
// removed and drop its history from the account's totals. Skipping it leaves the
// previous row in place, unchanged, until the job is corrected.
func buildAccountRows(jobs []models.Job, now time.Time) (rows []models.ArchivedJobStats, keepIDs []string, skipped int) {
	rows = make([]models.ArchivedJobStats, 0, len(jobs))
	keepIDs = make([]string, 0, len(jobs))

	for _, job := range jobs {
		snap, err := computeBuildStatSnapshot(job)
		if err != nil {
			skipped++
			keepIDs = append(keepIDs, eipmongo.ArchivedJobStatsDocumentID(job.MetaData.AccountID, job.JobID))
			continue
		}
		row := archivestats.BuildAccountSnapshot(job, snap, now)
		rows = append(rows, row)
		keepIDs = append(keepIDs, row.ID)
	}
	return rows, keepIDs, skipped
}
