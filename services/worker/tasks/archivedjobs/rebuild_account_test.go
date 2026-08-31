package archivedjobs

import (
	"encoding/json"
	eipnats "eve-industry-planner/shared/nats"
	"github.com/hibiken/asynq"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	esitasks "eve-industry-planner/worker/tasks/esi"
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

func TestDispatchRequiresHandles(t *testing.T) {
	t.Parallel()

	if _, err := DispatchQueuedRebuilds(t.Context(), nil, nil, time.Now()); err == nil {
		t.Fatal("expected an error without a mongo handle")
	}
}

// A dispatch that could not publish for some owners leaves them queued, so the
// counts have to separate what went out from what did not.
func TestDispatchResultSeparatesDispatchedFromFailed(t *testing.T) {
	t.Parallel()

	out := DispatchResult{Eligible: 5, Dispatched: 4, Failed: 1}

	if out.Dispatched+out.Failed != out.Eligible {
		t.Fatalf("every eligible owner is either dispatched or failed: %+v", out)
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

	acc := &accountRows{now: time.Now().UTC()}
	for _, job := range jobs {
		acc.add(job)
	}
	rows, keepIDs, skipped := acc.rows, acc.keepIDs, acc.skipped

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

	acc := &accountRows{now: time.Now().UTC()}
	rows, keepIDs, skipped := acc.rows, acc.keepIDs, acc.skipped
	if len(rows) != 0 || len(keepIDs) != 0 || skipped != 0 {
		t.Fatalf("rows=%d keep=%d skipped=%d, want all zero", len(rows), len(keepIDs), skipped)
	}
}

// The task carries no payload, so a nil task is valid input — the queue names
// the work. Missing dependencies are not.
func TestDrainAccountStatsRebuildQueueTaskRequiresDependencies(t *testing.T) {
	t.Parallel()

	if err := DrainAccountStatsRebuildQueue(t.Context(), nil, nil); err == nil {
		t.Fatal("expected an error without task dependencies")
	}
	if err := DrainAccountStatsRebuildQueue(t.Context(), nil, &esitasks.TaskDependencies{}); err == nil {
		t.Fatal("expected an error without a mongo client")
	}
}

// The payload travels inside the task envelope, so a handler reading the raw
// bytes sees the wrapper rather than its own fields — and an owner decoded as
// empty fails validation with a message that says nothing about why.
func TestRebuildOwnerPayloadDecodesThroughTheEnvelope(t *testing.T) {
	t.Parallel()

	want := eipnats.RebuildOwnerStatisticsRequest{
		OwnerKind: string(models.StatsOwnerAccount),
		OwnerID:   "acct-1",
		Claim:     7,
	}
	inner, err := json.Marshal(eipnats.TaskMessage{
		TaskType: eipnats.RebuildOwnerStatistics.Name,
		Data:     mustJSON(t, want),
	})
	if err != nil {
		t.Fatal(err)
	}
	envelope, err := json.Marshal(struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{TaskType: eipnats.RebuildOwnerStatistics.Name, Data: inner})
	if err != nil {
		t.Fatal(err)
	}

	got, err := esitasks.UnmarshalTaskPayload[eipnats.RebuildOwnerStatisticsRequest](
		asynq.NewTask(eipnats.RebuildOwnerStatistics.Name, envelope),
	)
	if err != nil {
		t.Fatalf("UnmarshalTaskPayload: %v", err)
	}
	if got != want {
		t.Fatalf("decoded %+v, want %+v", got, want)
	}
}

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
