package archivedjobs

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/statistics"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const skippedScratchAccount = "eip-parity-skipped-account"

// A job the reduction cannot read keeps the figures it last had, because it is
// still archived and dropping them would take real history out of the totals.
// What must not happen is that the row goes on claiming to be current: the
// aggregates agree with it, so reconciliation reports no drift and nothing
// revisits it. Requires EIP_MONGO_PARITY_LIVE=1.

// buildableJob produces something, so its figures can be computed. Its cost is
// one extras row: a figure the reduction reads directly, so the fixture says
// nothing about how materials are counted.
func buildableJob(jobID string, at time.Time) models.Job {
	job := models.Job{JobID: jobID, ItemID: 34, JobType: 1, ItemsProducedPerRun: 10}
	job.Build.Setup = map[string]models.JobSetup{
		"setup-1": {ID: "setup-1", RunCount: 2, JobCount: 1},
	}
	job.Build.Costs.ExtrasCosts = []models.ExtraCost{
		{ID: "extra-1", Category: "0", ExtraText: "Courier", ExtraValue: 5000},
	}
	job.MetaData.Owner.ID = skippedScratchAccount
	job.MetaData.ArchivedAt = at
	return job
}

func seedArchivedJob(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, job models.Job) {
	t.Helper()
	if _, err := mongo.ArchivedJobs.UpsertStructPreservingMeta(ctx, job, job.JobID); err != nil {
		t.Fatalf("seed archived job %s: %v", job.JobID, err)
	}
}

func loadStatsRow(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, jobID string) models.ArchivedJobStats {
	t.Helper()
	var row models.ArchivedJobStats
	err := mongo.StatisticsRows.Collection().FindOne(ctx,
		bson.M{"_id": eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(skippedScratchAccount), jobID)},
	).Decode(&row)
	if err != nil {
		t.Fatalf("statistics row for %s: %v", jobID, err)
	}
	return row
}

func TestLive_aJobThatCanNoLongerBeReadKeepsItsFiguresAndSaysSo(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, skippedScratchAccount)

	now := time.Now().UTC()
	job := buildableJob("job-skip-1", now)
	seedArchivedJob(t, ctx, mongo, job)

	if _, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now); err != nil {
		t.Fatalf("first rebuild: %v", err)
	}
	before := loadStatsRow(t, ctx, mongo, "job-skip-1")
	if before.TotalProduced == 0 || before.FiguresAreStale() {
		t.Fatalf("a readable job should have figures and no stamp: %+v", before)
	}

	// The setups are what say how much the job made, so a job without them
	// produces nothing and cannot be reduced — the shape 400 generated jobs had.
	broken := job
	broken.Build.Setup = nil
	seedArchivedJob(t, ctx, mongo, broken)

	result, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now.Add(time.Minute))
	if err != nil {
		t.Fatalf("second rebuild: %v", err)
	}
	if result.SkippedJobs != 1 || result.StaleRows != 1 {
		t.Fatalf("rebuild reported skipped=%d stale=%d, want 1 and 1", result.SkippedJobs, result.StaleRows)
	}

	after := loadStatsRow(t, ctx, mongo, "job-skip-1")
	if after.Revoked {
		t.Fatal("the job is still archived, so its row must not be revoked")
	}
	if after.TotalProduced != before.TotalProduced || after.TotalExtras != before.TotalExtras {
		t.Fatalf("the figures changed under a job that could not be read: %+v", after)
	}
	if !after.FiguresAreStale() {
		t.Fatal("a row the rebuild could not recompute has to say so")
	}
	if after.SkipReason == "" {
		t.Fatal("the stamp carries why, so a reader is not left guessing")
	}
}

// The stamp is not a permanent mark: fixing the job and rebuilding clears it,
// which is what makes a recalculation the way out.
func TestLive_readingTheJobAgainClearsTheStamp(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, skippedScratchAccount)

	now := time.Now().UTC()
	job := buildableJob("job-skip-2", now)
	seedArchivedJob(t, ctx, mongo, job)
	if _, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now); err != nil {
		t.Fatalf("first rebuild: %v", err)
	}

	broken := job
	broken.Build.Setup = nil
	seedArchivedJob(t, ctx, mongo, broken)
	if _, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now.Add(time.Minute)); err != nil {
		t.Fatalf("second rebuild: %v", err)
	}
	if !loadStatsRow(t, ctx, mongo, "job-skip-2").FiguresAreStale() {
		t.Fatal("the row should be stamped before the job is repaired")
	}

	seedArchivedJob(t, ctx, mongo, job)
	result, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now.Add(2*time.Minute))
	if err != nil {
		t.Fatalf("third rebuild: %v", err)
	}
	if result.SkippedJobs != 0 || result.StaleRows != 0 {
		t.Fatalf("a readable job left skipped=%d stale=%d", result.SkippedJobs, result.StaleRows)
	}

	repaired := loadStatsRow(t, ctx, mongo, "job-skip-2")
	if repaired.FiguresAreStale() {
		t.Fatal("a row rewritten from a readable job still carries its stamp")
	}
	if repaired.ContributedAt == nil {
		t.Fatal("the rebuild counts what it writes, so the row is stamped as counted")
	}
}

// The stamp says a row is stale; it must not change what the row contributes,
// or a rebuild would move an account's totals over a document it could not read.
func TestLive_stampingDoesNotMoveTheAggregates(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, skippedScratchAccount)

	now := time.Now().UTC()
	job := buildableJob("job-skip-3", now)
	seedArchivedJob(t, ctx, mongo, job)
	if _, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now); err != nil {
		t.Fatalf("first rebuild: %v", err)
	}

	rows, err := mongo.LoadArchivedJobStats(ctx, models.AccountOwner(skippedScratchAccount))
	if err != nil {
		t.Fatalf("load rows: %v", err)
	}
	wanted := statistics.AccumulateBuckets(rows)

	broken := job
	broken.Build.Setup = nil
	seedArchivedJob(t, ctx, mongo, broken)
	if _, err := RebuildStatistics(ctx, mongo, models.AccountOwner(skippedScratchAccount), now.Add(time.Minute)); err != nil {
		t.Fatalf("second rebuild: %v", err)
	}

	after, err := mongo.LoadArchivedJobStats(ctx, models.AccountOwner(skippedScratchAccount))
	if err != nil {
		t.Fatalf("reload rows: %v", err)
	}
	got := statistics.AccumulateBuckets(after)
	if len(got) != len(wanted) {
		t.Fatalf("buckets went from %d to %d over a job that could not be read", len(wanted), len(got))
	}
	for key, want := range wanted {
		if have := got[key]; have.Measures.JobCostTotal != want.Measures.JobCostTotal || have.Rows != want.Rows {
			t.Fatalf("bucket %v changed: %+v, want %+v", key, have, want)
		}
	}
}
