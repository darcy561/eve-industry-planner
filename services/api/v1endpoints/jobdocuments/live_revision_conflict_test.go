// A stale write refused over the handlers, with real Mongo behind them.
//
// The unit tests build filters and decide conflicts in isolation; this is the
// only place the wiring is exercised — a request in, a 409 body out, with the
// figures the client reconciles against coming from a document that really did
// move.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
package jobdocuments

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// storedRevision is the counter the document carries now.
func storedRevision(t *testing.T, s *plannerScope, jobID string) int64 {
	t.Helper()
	var stored models.Job
	if err := s.mongo.JobDocuments.Collection().
		FindOne(context.Background(),
			bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, jobID)}).
		Decode(&stored); err != nil {
		t.Fatalf("read the stored job: %v", err)
	}
	return stored.MetaData.Revision
}

// conflictBody is the 409 a refused write answers with.
type conflictBody struct {
	Error      string `json:"error"`
	Collection string `json:"collection"`
	Saved      int    `json:"saved"`
	Rejected   []struct {
		DocID    string `json:"docID"`
		Expected int64  `json:"expected"`
		Current  int64  `json:"current"`
		Gone     bool   `json:"gone"`
	} `json:"rejected"`
}

func decodeConflict(t *testing.T, body []byte) conflictBody {
	t.Helper()
	var parsed conflictBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("decode 409 body: %v — %s", err, body)
	}
	return parsed
}

// A write carrying a revision the document has moved past is refused, and the
// answer carries what the client must reconcile against.
func TestLive_AStaleWriteIsRefusedWithAConflictBody(t *testing.T) {
	s := newPlannerScope(t)
	job := plannerScopeJob("revision-conflict-stale")

	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	readAt := storedRevision(t, s, job.JobID)

	// Somebody else writes, moving the document past what this client read.
	moved := plannerScopeJob(job.JobID)
	moved.Name = "moved by somebody else"
	moved.MetaData.Revision = readAt
	if rec := s.putJobs([]models.Job{moved}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("intervening write = %d: %s", rec.Code, rec.Body.String())
	}
	movedTo := storedRevision(t, s, job.JobID)

	// The stale client writes from the copy it read before that.
	stale := plannerScopeJob(job.JobID)
	stale.Name = "written from a stale copy"
	stale.MetaData.Revision = readAt

	rec := s.putJobs([]models.Job{stale}, s.account, s.handle)

	if rec.Code != http.StatusConflict {
		t.Fatalf("stale write = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	body := decodeConflict(t, rec.Body.Bytes())
	if body.Error != "revision_conflict" {
		t.Fatalf("error = %q, want revision_conflict", body.Error)
	}
	if body.Saved != 0 {
		t.Fatalf("saved = %d, want 0 — nothing else was in the batch", body.Saved)
	}
	if len(body.Rejected) != 1 {
		t.Fatalf("rejected = %+v, want the one stale job", body.Rejected)
	}
	row := body.Rejected[0]
	if row.DocID != job.JobID {
		t.Fatalf("rejected names %q, want %q", row.DocID, job.JobID)
	}
	if row.Expected != readAt {
		t.Fatalf("expected = %d, want the revision the client read (%d)", row.Expected, readAt)
	}
	if row.Current != movedTo {
		t.Fatalf("current = %d, want the revision it moved to (%d)", row.Current, movedTo)
	}
	if row.Gone {
		t.Fatal("the document still exists, so the conflict must not report it gone")
	}

	// The refusal has to mean the write did not land.
	var after models.Job
	if err := s.mongo.JobDocuments.Collection().
		FindOne(context.Background(),
			bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, job.JobID)}).
		Decode(&after); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if after.Name != "moved by somebody else" {
		t.Fatalf("stored name = %q, want the intervening write kept", after.Name)
	}
}

// A batch in which one job moved writes the others, and says how many landed.
// The all-or-nothing refusal this replaces cost a member every job in a save.
func TestLive_ABatchWithOneStaleJobWritesTheRestAndSaysSo(t *testing.T) {
	s := newPlannerScope(t)
	stale := plannerScopeJob("revision-conflict-batch-stale")
	fresh := plannerScopeJob("revision-conflict-batch-fresh")

	if rec := s.putJobs([]models.Job{stale, fresh}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	staleReadAt := storedRevision(t, s, stale.JobID)
	freshReadAt := storedRevision(t, s, fresh.JobID)

	moved := plannerScopeJob(stale.JobID)
	moved.Name = "moved by somebody else"
	moved.MetaData.Revision = staleReadAt
	if rec := s.putJobs([]models.Job{moved}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("intervening write = %d: %s", rec.Code, rec.Body.String())
	}

	stale.Name = "stale after"
	stale.MetaData.Revision = staleReadAt
	fresh.Name = "fresh after"
	fresh.MetaData.Revision = freshReadAt

	rec := s.putJobs([]models.Job{stale, fresh}, s.account, s.handle)

	if rec.Code != http.StatusConflict {
		t.Fatalf("mixed batch = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	body := decodeConflict(t, rec.Body.Bytes())
	if body.Saved != 1 {
		t.Fatalf("saved = %d, want 1 — the unconflicted job landed", body.Saved)
	}
	if len(body.Rejected) != 1 || body.Rejected[0].DocID != stale.JobID {
		t.Fatalf("rejected = %+v, want only the stale job", body.Rejected)
	}

	var storedFresh models.Job
	if err := s.mongo.JobDocuments.Collection().
		FindOne(context.Background(),
			bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, fresh.JobID)}).
		Decode(&storedFresh); err != nil {
		t.Fatalf("read the fresh job: %v", err)
	}
	if storedFresh.Name != "fresh after" {
		t.Fatalf("the unconflicted job was not written: name = %q", storedFresh.Name)
	}
}

// A write carrying no revision is accepted as it always was, which is what lets
// a client that does not yet send one keep working.
func TestLive_AnUnversionedWriteIsStillAccepted(t *testing.T) {
	s := newPlannerScope(t)
	job := plannerScopeJob("revision-conflict-unversioned")

	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}

	// No revision on the body, and the stored document has moved past its first.
	job.Name = "written without a revision"
	rec := s.putJobs([]models.Job{job}, s.account, s.handle)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("unversioned write = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}
