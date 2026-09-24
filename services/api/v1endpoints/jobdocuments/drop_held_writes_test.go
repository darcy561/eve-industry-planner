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

func writesFor(jobIDs ...string) []models.JobWriteBody {
	writes := make([]models.JobWriteBody, 0, len(jobIDs))
	for _, id := range jobIDs {
		writes = append(writes, models.JobWriteBody{JobID: id})
	}
	return writes
}

func writtenJobIDs(writes []models.JobWriteBody) []string {
	ids := make([]string, 0, len(writes))
	for _, write := range writes {
		ids = append(ids, write.JobID)
	}
	return ids
}

// One member editing one job used to cost every other job in the same save. The
// jobs nobody holds are exactly the ones the writer may still save.
func TestDropHeldWritesKeepsTheRestInOrder(t *testing.T) {
	t.Parallel()
	writes := writesFor("a", "held-1", "b", "held-2", "c")

	got := writtenJobIDs(dropHeldWrites(writes, heldItems("held-1", "held-2")))

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

func TestDropHeldWritesKeepsEverythingWhenNothingIsHeld(t *testing.T) {
	t.Parallel()
	writes := writesFor("a", "b")

	if got := writtenJobIDs(dropHeldWrites(writes, nil)); len(got) != 2 {
		t.Fatalf("kept %v, want both", got)
	}
}

// Every job held means nothing to write, which the handler answers as the
// whole-batch refusal rather than as a partial write.
func TestDropHeldWritesCanKeepNothing(t *testing.T) {
	t.Parallel()
	writes := writesFor("a", "b")

	if got := dropHeldWrites(writes, heldItems("a", "b")); len(got) != 0 {
		t.Fatalf("kept %v, want none", writtenJobIDs(got))
	}
}

// A write is dropped by the job it names rather than by anything in its
// document: the gate runs before a document is decoded, and a field-scoped write
// carries `jobID` inside its document only if the reader happened to change it.
func TestDropHeldWritesReadsTheIDBesideTheDocument(t *testing.T) {
	t.Parallel()
	writes := []models.JobWriteBody{
		{JobID: "held", Revision: 4, Document: []byte(`{"name":"held"}`)},
		{JobID: "free", Revision: 4, Document: []byte(`{"name":"free"}`)},
	}

	got := writtenJobIDs(dropHeldWrites(writes, heldItems("held")))

	if len(got) != 1 || got[0] != "free" {
		t.Fatalf("kept %v, want only the write nobody holds", got)
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
