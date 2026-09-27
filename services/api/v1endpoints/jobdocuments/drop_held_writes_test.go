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

func TestDropHeldWritesKeepsTheRestInOrder(t *testing.T) {
	t.Parallel()
	writes := writesFor("a", "held-1", "b", "held-2", "c")

	got := writtenJobIDs(dropHeldWrites(writes, heldItems("held-1", "held-2")))

	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("kept %v, want %v", got, want)
	}
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

func TestDropHeldWritesCanKeepNothing(t *testing.T) {
	t.Parallel()
	writes := writesFor("a", "b")

	if got := dropHeldWrites(writes, heldItems("a", "b")); len(got) != 0 {
		t.Fatalf("kept %v, want none", writtenJobIDs(got))
	}
}

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

func TestNoRefusalWhenTheBatchLanded(t *testing.T) {
	t.Parallel()
	if got := refusalFor(0, 0); got != refusalNone {
		t.Fatalf("refusal = %v, want none", got)
	}
}
