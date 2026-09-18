package mongo

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func conflictOwner() models.Owner { return models.AccountOwner("acct-1") }

// updateFor builds a job's write the way BulkUpsertJobs does.
func updateFor(t *testing.T, jobID string) bson.M {
	t.Helper()
	update, err := SetDocumentWithRevision(models.Job{JobID: jobID}, JobDocumentsUpsertUnset)
	if err != nil {
		t.Fatalf("SetDocumentWithRevision: %v", err)
	}
	return update
}

// A write carrying no revision keeps the upsert it has always had: a client that
// does not say which version it read is asking for the document to hold what it
// sent, whether or not one exists.
func TestUnversionedWriteUpserts(t *testing.T) {
	t.Parallel()
	model := buildJobUnconditionalUpsertModel(conflictOwner(), "job-1", updateFor(t, "job-1"))

	if model.Upsert == nil || !*model.Upsert {
		t.Fatal("an unversioned write must upsert")
	}
	filter, ok := model.Filter.(bson.M)
	if !ok {
		t.Fatalf("unexpected filter %#v", model.Filter)
	}
	if _, named := filter[FieldMetaRevision]; named {
		t.Fatalf("an unversioned write must not filter on a revision, got %#v", filter)
	}
}

// The counter is incremented, never set, so a client's own copy of it cannot
// overwrite the document's history.
func TestAWriteCountsItselfRatherThanSettingTheCounter(t *testing.T) {
	t.Parallel()
	update := updateFor(t, "job-1")

	inc, ok := update["$inc"].(bson.M)
	if !ok || inc[FieldMetaRevision] != 1 {
		t.Fatalf("$inc = %#v, want the revision counted", update["$inc"])
	}
	set, ok := update["$set"].(bson.M)
	if !ok {
		t.Fatalf("no $set in %#v", update)
	}
	if _, reset := set[FieldMetaRevision]; reset {
		t.Fatal("the revision was $set, which would overwrite the counter with the client's copy")
	}
}

// A conditional write is held back from the batch, because BulkWrite answers in
// totals that an unconditional write in the same batch also contributes to —
// so a batch could not say which conditional writes landed.
func TestAConditionalWriteIsNotPutInTheBatch(t *testing.T) {
	t.Parallel()
	conditional := conditionalJobWrite{jobID: "job-1", expected: 4, update: updateFor(t, "job-1")}

	filter := conditionalJobFilter(conflictOwner(), conditional)

	if filter[FieldMetaRevision] != int64(4) {
		t.Fatalf("filter = %#v, want the revision the client read named", filter)
	}
	if filter["_id"] != OwnerScopedDocumentID(conflictOwner(), "job-1") {
		t.Fatalf("filter = %#v, want the owner-scoped id", filter)
	}
}
