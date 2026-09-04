package archivedjobs

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"
)

const newRowsScratchAccount = "eip-parity-newrows-account"

// An archived job with no statistics row is invisible to the fold, whose work
// list is rows. The archive write builds the row, so this covers the case where
// that did not happen — an import, or a failed row write — and the rota has to
// put it right.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_archivedJobWithoutARowIsRecoveredByTheRota(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(newRowsScratchAccount)
	mongolive.ScratchAccount(t, mongo, newRowsScratchAccount)

	job := models.Job{
		JobID:               "job-newrow-1",
		ItemID:              34,
		JobType:             1,
		ItemsProducedPerRun: 10,
		Build: models.JobBuild{
			Setup: map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}},
			Costs: models.JobCosts{LinkedJobs: []models.LinkedESIJob{{JobID: 1, Cost: 200}}},
		},
	}
	job.MetaData.AccountID = newRowsScratchAccount
	job.MetaData.ArchivedAt = time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	if _, err := mongo.ArchivedJobs.UpsertStructPreservingMeta(ctx, job, job.JobID); err != nil {
		t.Fatalf("archive a job: %v", err)
	}

	now := time.Now().UTC()

	// The fold cannot see it: there is no row, and rows are its work list.
	if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkDelta, now); err != nil {
		t.Fatalf("queue the fold: %v", err)
	}
	queued, err := mongo.ListQueuedOwners(ctx, time.Time{})
	if err != nil {
		t.Fatalf("ListQueuedOwners: %v", err)
	}
	var entry eipmongo.QueuedOwner
	for _, q := range queued {
		if q.Owner.ID == newRowsScratchAccount {
			entry = q
		}
	}
	if entry.Owner.ID == "" {
		t.Fatal("the owner was not queued")
	}
	folded, _, err := applyOwnerDelta(ctx, mongo, entry, now)
	if err != nil {
		t.Fatalf("applyOwnerDelta: %v", err)
	}
	if folded.Added != 0 {
		t.Fatalf("the fold found %d rows for a job that has none", folded.Added)
	}

	// The rota builds the row and folds it in the same pass.
	result, err := ReconcileAccountStatistics(ctx, mongo, newRowsScratchAccount, now)
	if err != nil {
		t.Fatalf("ReconcileAccountStatistics: %v", err)
	}
	if result.Created != 1 {
		t.Fatalf("created %d rows for an archived job with none, want 1", result.Created)
	}
	if result.Rows != 1 {
		t.Fatalf("folded %d rows, want the row it just created", result.Rows)
	}

	buckets, err := mongo.LoadAccountTimelineMonths(ctx, newRowsScratchAccount)
	if err != nil {
		t.Fatalf("read buckets: %v", err)
	}
	if len(buckets) == 0 {
		t.Fatal("the job's figures never reached the timeline")
	}

	// A second pass has nothing new: the row exists and is counted.
	again, err := ReconcileAccountStatistics(ctx, mongo, newRowsScratchAccount, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("second reconcile: %v", err)
	}
	if again.Created != 0 {
		t.Fatalf("a second pass created %d rows; the job would be counted twice", again.Created)
	}
}
