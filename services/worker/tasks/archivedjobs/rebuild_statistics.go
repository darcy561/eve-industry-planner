package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// RebuildResult reports what one rebuild produced, for logging and for the
// drain to summarise a pass.
type RebuildResult struct {
	Owner          models.Owner
	ArchivedJobs   int
	StatsRows      int
	TimelineMonths int
	RevokedRows    int64
	PrunedBuckets  int64
	// ProductionTotals counts the lifetime per-item aggregates written.
	ProductionTotals int
	// PrunedTotals counts item types the owner no longer has any job for.
	PrunedTotals int64
	// SkippedJobs counts archived jobs whose snapshot could not be computed. They
	// are absent from the totals, so a non-zero count means the owner's figures
	// are incomplete rather than wrong.
	SkippedJobs int
	// StaleRows counts the skipped jobs that already had a row, now stamped as
	// holding the last figures that could be computed.
	StaleRows int
}

// rebuildUpsertBatch bounds one bulk write. Large enough that a typical owner
// is a single round trip, small enough that an outlier does not build a request
// Mongo rejects.
const rebuildUpsertBatch = 200

// RebuildStatistics recomputes an owner's statistics from its archived
// jobs, wholesale.
//
// Wholesale rather than incremental because the rebuild queue records only that
// an owner changed, not which jobs — and because recomputing everything is
// idempotent, which is what lets a rebuild be retried or run concurrently with a
// re-queue without corrupting totals.
//
// Order matters. Rows and buckets are written before anything is removed, so a
// reader that arrives mid-rebuild sees the previous complete set or the new
// complete set, never a gap where a month has been pruned and not yet rewritten.
func RebuildStatistics(
	ctx context.Context,
	mongo *eipmongo.Mongo,
	owner models.Owner,
	now time.Time,
) (RebuildResult, error) {
	out := RebuildResult{Owner: owner}
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if err := owner.Validate(); err != nil {
		return out, err
	}
	now = now.UTC()

	acc, err := buildRows(ctx, mongo, owner, now)
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
	stamped, err := mongo.StampSkippedStatsRows(ctx, owner, acc.skippedJobIDs, acc.skipReason, now)
	if err != nil {
		return out, err
	}
	out.StaleRows = int(stamped)

	folded := foldAggregates(owner, rows)
	written, err := writeAggregates(ctx, mongo, folded)
	if err != nil {
		return out, err
	}
	out.TimelineMonths = written.Buckets
	out.ProductionTotals = written.Totals

	// Anything the rebuild did not produce describes a job that is no longer
	// archived.
	revoked, err := mongo.RevokeArchivedJobStats(ctx, owner, keepRowIDs, now)
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

// ownerAggregates is one owner's two aggregate collections, folded from its
// rows and not yet written.
type ownerAggregates struct {
	Owner   models.Owner
	Buckets []models.TimelineMonthBucket
	Totals  []models.ProductionTotalsRow
}

// foldAggregates derives both collections from the rows.
//
// Separate from the write so a caller that wants to compare what is stored
// against what should be there folds once and uses the result for both.
func foldAggregates(owner models.Owner, rows []models.ArchivedJobStats) ownerAggregates {
	return ownerAggregates{
		Owner:   owner,
		Buckets: archivestats.TimelineBuckets(owner, rows),
		Totals:  archivestats.ProductionTotals(owner, rows),
	}
}

// writeAggregates writes a fold whole, removing anything it did not
// produce.
//
// Absolute rather than incremental: the result depends only on the rows, so two
// of these racing write the same values, and it repairs whatever was there
// before without needing to know how it went wrong.
//
// Order matters. Documents are written before anything is removed, so a reader
// arriving mid-write sees the previous complete set or the new one, never a gap
// where a month has been pruned and not yet rewritten.
func writeAggregates(ctx context.Context, mongo *eipmongo.Mongo, folded ownerAggregates) (aggregateWrite, error) {
	var out aggregateWrite
	owner, buckets, totals := folded.Owner, folded.Buckets, folded.Totals

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
		if _, err := mongo.ProductionTotals.UpsertStructsPreservingMetaBulk(ctx, totalItems, rebuildUpsertBatch); err != nil {
			return out, fmt.Errorf("upsert production totals: %w", err)
		}
	}

	pruned, err := mongo.PruneTimelineMonths(ctx, owner, keepBucketIDs)
	if err != nil {
		return out, fmt.Errorf("prune timeline months: %w", err)
	}
	out.PrunedBuckets = pruned

	prunedTotals, err := mongo.PruneProductionTotals(ctx, owner, keepTotalIDs)
	if err != nil {
		return out, fmt.Errorf("prune production totals: %w", err)
	}
	out.PrunedTotals = prunedTotals

	return out, nil
}

// ownerRows accumulates the rows a rebuild writes, and the row ids it must not
// revoke, one job at a time.
//
// Separate from the read so the reduction can be exercised without a database,
// and so a rebuild holds one job at a time: a row is far smaller than the job it
// came from, which keeps memory proportional to what is written rather than to
// the archive read.
type ownerRows struct {
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
// removed and drop its history from the owner's totals. The previous row
// stands, stamped as stale, until the job can be read again.
func (a *ownerRows) add(job models.Job) {
	a.jobCount++
	row, err := archivestats.NewRow(job, a.now)
	if err != nil {
		a.skipped++
		a.skippedJobIDs = append(a.skippedJobIDs, job.JobID)
		if a.skipReason == "" {
			a.skipReason = err.Error()
		}
		a.keepIDs = append(a.keepIDs, eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(job.MetaData.AccountID), job.JobID))
		return
	}
	// The rebuild writes the aggregates from these rows in the same pass, so they
	// are counted the moment they are written. Leaving them unstamped would offer
	// every one of them to the next fold as outstanding.
	row.ContributedAt = &a.now
	a.rows = append(a.rows, row)
	a.keepIDs = append(a.keepIDs, row.ID)
}

// buildRows walks an owner's archived jobs into the rows to write.
func buildRows(ctx context.Context, mongo *eipmongo.Mongo, owner models.Owner, now time.Time) (*ownerRows, error) {
	acc := &ownerRows{now: now}
	if err := mongo.EachOwnerArchivedJob(ctx, owner, func(job models.Job) error {
		acc.add(job)
		return nil
	}); err != nil {
		return nil, err
	}
	return acc, nil
}
