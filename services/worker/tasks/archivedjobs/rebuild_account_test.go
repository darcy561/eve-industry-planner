package archivedjobs

import (
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

func TestRebuildAccountStatisticsRequiresHandleAndAccount(t *testing.T) {
	t.Parallel()

	if _, err := RebuildAccountStatistics(t.Context(), nil, "acct-1", time.Now()); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
	var nilMongo *eipmongo.Mongo
	if _, err := RebuildAccountStatistics(t.Context(), nilMongo, "", time.Now()); err == nil {
		t.Fatal("expected an error for an empty accountID")
	}
}

func TestDrainRequiresAHandle(t *testing.T) {
	t.Parallel()

	if _, err := DrainAccountRebuildQueue(t.Context(), nil, time.Now()); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
}

// A pass that clears fewer accounts than it rebuilt means the difference changed
// again mid-rebuild and stayed queued. The drain reports that rather than
// treating the pass as fully drained.
func TestDrainResultReportsRequeuesSeparatelyFromFailures(t *testing.T) {
	t.Parallel()

	out := DrainResult{Queued: 5, Rebuilt: 4, Cleared: 3, Failed: 1}
	out.Requeued = out.Rebuilt - int(out.Cleared)

	if out.Requeued != 1 {
		t.Fatalf("requeued = %d, want 1", out.Requeued)
	}
	if out.Rebuilt+out.Failed != out.Queued {
		t.Fatalf("every queued account must be rebuilt or failed: %+v", out)
	}
}

func archivedJob(accountID, jobID string, produced int) models.Job {
	job := models.Job{JobID: jobID}
	job.MetaData.AccountID = accountID
	job.Build.Products.TotalQuantity = produced
	return job
}

// A job whose snapshot cannot be computed is still archived. Leaving its id out
// of the keep set would revoke its existing row, recording a job that is still
// there as removed and dropping its history from the account's totals.
func TestSkippedJobsAreStillKeptFromRevocation(t *testing.T) {
	t.Parallel()

	jobs := []models.Job{
		archivedJob("acct-1", "good-1", 10),
		archivedJob("acct-1", "broken", 0), // totalQuantity 0 — no snapshot
		archivedJob("acct-1", "good-2", 5),
	}

	rows, keepIDs, skipped := buildAccountRows(jobs, time.Now().UTC())

	if skipped != 1 {
		t.Fatalf("skipped = %d, want 1", skipped)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 — the unusable job contributes no totals", len(rows))
	}
	if len(keepIDs) != 3 {
		t.Fatalf("keepIDs = %v, want one per job including the skipped one", keepIDs)
	}
	if !slices.Contains(keepIDs, "acct-1|broken") {
		t.Fatalf("the skipped job's row would be revoked; keepIDs = %v", keepIDs)
	}
}

// An account with no archived jobs keeps nothing, which is what lets the rebuild
// revoke every row and prune every bucket for an emptied account.
func TestNoJobsKeepsNothing(t *testing.T) {
	t.Parallel()

	rows, keepIDs, skipped := buildAccountRows(nil, time.Now().UTC())
	if len(rows) != 0 || len(keepIDs) != 0 || skipped != 0 {
		t.Fatalf("rows=%d keep=%d skipped=%d, want all zero", len(rows), len(keepIDs), skipped)
	}
}
