package jobdocuments

import (
	"context"
	"net/http"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

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
	if err := jsoncodec.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("decode 409 body: %v — %s", err, body)
	}
	return parsed
}

func TestLive_AStaleWriteIsRefusedWithAConflictBody(t *testing.T) {
	s := newPlannerScope(t)
	job := plannerScopeJob("revision-conflict-stale")

	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	readAt := storedRevision(t, s, job.JobID)

	moved := plannerScopeJob(job.JobID)
	moved.Name = "moved by somebody else"
	moved.MetaData.Revision = readAt
	if rec := s.putJobs([]models.Job{moved}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("intervening write = %d: %s", rec.Code, rec.Body.String())
	}
	movedTo := storedRevision(t, s, job.JobID)

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

func TestLive_AnUnversionedWriteIsStillAccepted(t *testing.T) {
	s := newPlannerScope(t)
	job := plannerScopeJob("revision-conflict-unversioned")

	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}

	job.Name = "written without a revision"
	rec := s.putJobs([]models.Job{job}, s.account, s.handle)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("unversioned write = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}
