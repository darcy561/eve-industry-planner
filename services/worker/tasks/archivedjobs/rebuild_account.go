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
	// StaleRows counts the skipped jobs that already had a row, now stamped as
	// holding the last figures that could be computed.
	StaleRows int
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

	acc, err := buildAccountRows(ctx, mongo, accountID, now)
	if err != nil {
		return out, fmt.Errorf("load archived jobs: %w", err)
	}
	rows, keepRowIDs := acc.rows, acc.keepIDs
	out.ArchivedJobs = acc.jobCount
	out.StatsRows = len(rows)
	out.SkippedJobs = acc.skipped

	if err := mongo.WriteStatsRows(ctx, rows, rebuildUpsertBatch); err != nil {
		return out, fmt.Errorf("upsert statistics rows: %w", err)
	}

	// After the write, so a job that can be read again has already cleared the
	// stamp its previous row carried.
	stamped, err := mongo.StampSkippedStatsRows(ctx, accountID, acc.skippedJobIDs, acc.skipReason, now)
	if err != nil {
		return out, err
	}
	out.StaleRows = int(stamped)

	folded := foldAccountAggregates(accountID, rows)
	written, err := writeAccountAggregates(ctx, mongo, folded)
	if err != nil {
		return out, err
	}
	out.TimelineMonths = written.Buckets
	out.ProductionTotals = written.Totals

	// Anything the rebuild did not produce describes a job that is no longer
	// archived.
	revoked, err := mongo.RevokeAccountArchivedJobStats(ctx, accountID, keepRowIDs, now)
	if err != nil {
		return out, fmt.Errorf("revoke removed statistics rows: %w", err)
	}
	out.RevokedRows = revoked
	out.PrunedBuckets = written.PrunedBuckets
	out.PrunedTotals = written.PrunedTotals

	return out, nil
}

// aggregateWrite reports what one absolute write of an owner's aggregates did.
type aggregateWrite struct {
	Buckets       int
	Totals        int
	PrunedBuckets int64
	PrunedTotals  int64
}

// accountAggregates is one owner's two aggregate collections, folded from its
// rows and not yet written.
type accountAggregates struct {
	AccountID string
	Buckets   []models.AccountTimelineMonthBucket
	Totals    []models.ProductionTotalsRow
}

// foldAccountAggregates derives both collections from the rows.
//
// Separate from the write so a caller that wants to compare what is stored
// against what should be there folds once and uses the result for both.
func foldAccountAggregates(accountID string, rows []models.ArchivedJobStats) accountAggregates {
	return accountAggregates{
		AccountID: accountID,
		Buckets:   archivestats.AccountBuckets(accountID, rows),
		Totals:    archivestats.AccountProductionTotals(accountID, rows),
	}
}

// writeAccountAggregates writes a fold whole, removing anything it did not
// produce.
//
// Absolute rather than incremental: the result depends only on the rows, so two
// of these racing write the same values, and it repairs whatever was there
// before without needing to know how it went wrong.
//
// Order matters. Documents are written before anything is removed, so a reader
// arriving mid-write sees the previous complete set or the new one, never a gap
// where a month has been pruned and not yet rewritten.
func writeAccountAggregates(ctx context.Context, mongo *eipmongo.Mongo, folded accountAggregates) (aggregateWrite, error) {
	var out aggregateWrite
	accountID, buckets, totals := folded.AccountID, folded.Buckets, folded.Totals

	bucketItems := make([]eipmongo.StructUpsertItem, 0, len(buckets))
	keepBucketIDs := make([]string, 0, len(buckets))
	for _, bucket := range buckets {
		bucketItems = append(bucketItems, eipmongo.StructUpsertItem{DocID: bucket.ID, Value: bucket})
		keepBucketIDs = append(keepBucketIDs, bucket.ID)
	}
	out.Buckets = len(buckets)

	if len(bucketItems) > 0 {
		if _, err := mongo.AccountTimelineMonths.UpsertStructsPreservingMetaBulk(ctx, bucketItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert timeline months: %w", err)
		}
	}

	// Lifetime totals per item type, the documents the totals read serves.
	// Derived from the same rows rather than incremented per job by a second
	// worker, so they cannot disagree with the timeline written beside them.
	totalItems := make([]eipmongo.StructUpsertItem, 0, len(totals))
	keepTotalIDs := make([]string, 0, len(totals))
	for _, total := range totals {
		totalItems = append(totalItems, eipmongo.StructUpsertItem{DocID: total.ID, Value: total})
		keepTotalIDs = append(keepTotalIDs, total.ID)
	}
	out.Totals = len(totals)

	if len(totalItems) > 0 {
		if _, err := mongo.AccountProductionTotals.UpsertStructsPreservingMetaBulk(ctx, totalItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert production totals: %w", err)
		}
	}

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

// accountRows accumulates the rows a rebuild writes, and the row ids it must not
// revoke, one job at a time.
//
// Separate from the read so the reduction can be exercised without a database,
// and so a rebuild holds one job at a time: a row is far smaller than the job it
// came from, which keeps memory proportional to what is written rather than to
// the archive read.
type accountRows struct {
	now      time.Time
	rows     []models.ArchivedJobStats
	keepIDs  []string
	jobCount int
	skipped  int
	// skippedJobIDs and skipReason carry what could not be reduced, so the rows
	// left standing can say the figures on them are the last computable ones.
	skippedJobIDs []string
	skipReason    string
}

// add reduces one archived job.
//
// A job whose snapshot cannot be computed is skipped but its id is still kept:
// the job is still archived, so revoking its existing row would record it as
// removed and drop its history from the account's totals. The previous row
// stands, stamped as stale, until the job can be read again.
func (a *accountRows) add(job models.Job) {
	a.jobCount++
	row, err := archivestats.NewAccountRow(job, a.now)
	if err != nil {
		a.skipped++
		a.skippedJobIDs = append(a.skippedJobIDs, job.JobID)
		if a.skipReason == "" {
			a.skipReason = err.Error()
		}
		a.keepIDs = append(a.keepIDs, eipmongo.ArchivedJobStatsDocumentID(job.MetaData.AccountID, job.JobID))
		return
	}
	// The rebuild writes the aggregates from these rows in the same pass, so they
	// are counted the moment they are written. Leaving them unstamped would offer
	// every one of them to the next fold as outstanding.
	row.ContributedAt = &a.now
	a.rows = append(a.rows, row)
	a.keepIDs = append(a.keepIDs, row.ID)
}

// buildAccountRows walks an account's archived jobs into the rows to write.
func buildAccountRows(ctx context.Context, mongo *eipmongo.Mongo, accountID string, now time.Time) (*accountRows, error) {
	acc := &accountRows{now: now}
	if err := mongo.EachAccountArchivedJob(ctx, accountID, func(job models.Job) error {
		acc.add(job)
		return nil
	}); err != nil {
		return nil, err
	}
	return acc, nil
}
