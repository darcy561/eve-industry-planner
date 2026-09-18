package jobdocuments

import (
	"testing"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/models"
)

func heldItems(docIDs ...string) []documentlock.LockHeldElsewhereItem {
	items := make([]documentlock.LockHeldElsewhereItem, 0, len(docIDs))
	for _, id := range docIDs {
		items = append(items, documentlock.LockHeldElsewhereItem{DocID: id})
	}
	return items
}

func jobIDsOf(jobs []models.Job) []string {
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		ids = append(ids, job.JobID)
	}
	return ids
}

// One member editing one job used to cost every other job in the same save. The
// jobs nobody holds are exactly the ones the writer may still save.
func TestDropHeldJobsKeepsTheRestInOrder(t *testing.T) {
	t.Parallel()
	jobs := []models.Job{
		{JobID: "a"}, {JobID: "held-1"}, {JobID: "b"}, {JobID: "held-2"}, {JobID: "c"},
	}

	got := jobIDsOf(dropHeldJobs(jobs, heldItems("held-1", "held-2")))

	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("kept %v, want %v", got, want)
	}
	// Order matters as much as membership: the filter reuses the backing array,
	// so a writer that read after it wrote would return corrupted rows rather
	// than an obviously wrong count.
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("kept %v, want %v", got, want)
		}
	}
}

func TestDropHeldJobsKeepsEverythingWhenNothingIsHeld(t *testing.T) {
	t.Parallel()
	jobs := []models.Job{{JobID: "a"}, {JobID: "b"}}

	if got := jobIDsOf(dropHeldJobs(jobs, nil)); len(got) != 2 {
		t.Fatalf("kept %v, want both", got)
	}
}

// Every job held means nothing to write, which the handler answers as the
// whole-batch refusal rather than as a partial write.
func TestDropHeldJobsCanKeepNothing(t *testing.T) {
	t.Parallel()
	jobs := []models.Job{{JobID: "a"}, {JobID: "b"}}

	if got := dropHeldJobs(jobs, heldItems("a", "b")); len(got) != 0 {
		t.Fatalf("kept %v, want none", jobIDsOf(got))
	}
}

// One batch can produce both refusals, and a response carries one. The lock
// wins, because a held job was never written and its edits are still owed —
// answering the revision conflict would leave the held job unnamed, and the
// client clears whatever a refusal does not name, discarding work nothing wrote.
func TestALockConflictIsAnsweredBeforeARevisionConflict(t *testing.T) {
	t.Parallel()
	if got := refusalFor(1, 1); got != refusalLockHeld {
		t.Fatalf("refusal = %v, want the lock answered first", got)
	}
}

func TestEachRefusalIsAnsweredWhenItIsTheOnlyOne(t *testing.T) {
	t.Parallel()
	if got := refusalFor(2, 0); got != refusalLockHeld {
		t.Fatalf("refusal = %v, want a lock refusal", got)
	}
	if got := refusalFor(0, 2); got != refusalRevision {
		t.Fatalf("refusal = %v, want a revision refusal", got)
	}
}

// A batch that met neither is a plain success, and must not answer a 409 naming
// nothing.
func TestNoRefusalWhenTheBatchLanded(t *testing.T) {
	t.Parallel()
	if got := refusalFor(0, 0); got != refusalNone {
		t.Fatalf("refusal = %v, want none", got)
	}
}
