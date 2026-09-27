package jobdocuments

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func storedJob(t *testing.T, s *plannerScope, jobID string) models.Job {
	t.Helper()
	var job models.Job
	if err := s.mongo.JobDocuments.Collection().
		FindOne(context.Background(),
			bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, jobID)}).
		Decode(&job); err != nil {
		t.Fatalf("read the stored job: %v", err)
	}
	return job
}

func (s *plannerScope) putWrites(writes []models.JobWriteBody, accountID, plannerHandle string) *httptest.ResponseRecorder {
	s.t.Helper()
	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.request(http.MethodPut, "/api/v1/job-documents",
		map[string]any{"jobs": writes}, accountID, plannerHandle))
	return rec
}

func TestLive_TheCorpusWriteChangesOnlyWhatItNames(t *testing.T) {
	s := newPlannerScope(t)
	corpus := loadJobWriteCorpus(t)

	var seed models.Job
	if err := jsoncodec.Unmarshal(corpus.Job, &seed); err != nil {
		t.Fatalf("read the corpus job: %v", err)
	}
	seed.Build.ExtrasCosts["e-2"] = models.ExtraCost{ID: "e-2", ExtraText: "Deleted by the reader", ExtraValue: 500}
	seed.Name = "before the write"
	seed.Build.Materials["34"] = models.JobMaterial{TypeID: 34, Name: "Tritanium", Volume: 1}
	seed.MetaData.Revision = 0

	if rec := s.putJobs([]models.Job{seed}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	stored := storedJob(t, s, seed.JobID)
	if _, seeded := stored.Build.ExtrasCosts["e-2"]; !seeded {
		t.Fatal("the seed stored no row for the write to remove, so removing it would prove nothing")
	}

	write := corpus.Write
	write.Revision = stored.MetaData.Revision

	rec := s.putWrites([]models.JobWriteBody{write}, s.account, s.handle)
	if rec.Code >= http.StatusBadRequest {
		t.Fatalf("the write the SPA builds was refused: %d — %s", rec.Code, rec.Body.String())
	}

	after := storedJob(t, s, seed.JobID)

	var wanted models.Job
	if err := jsoncodec.Unmarshal(corpus.Job, &wanted); err != nil {
		t.Fatalf("read the corpus job: %v", err)
	}
	if after.Name != wanted.Name {
		t.Fatalf("name = %q, want the write's %q", after.Name, wanted.Name)
	}
	if got, want := after.Build.Materials["34"].Volume, wanted.Build.Materials["34"].Volume; got != want {
		t.Fatalf("the named material's volume = %v, want %v", got, want)
	}
	if _, present := after.Build.ExtrasCosts["e-2"]; present {
		t.Fatal("the row the write removed is still stored")
	}

	if _, kept := after.Build.ExtrasCosts["e-1"]; !kept {
		t.Fatal("the extra cost the write never mentioned was lost")
	}
	if got := after.Build.Materials["34"].Name; got != "Tritanium" {
		t.Fatalf("the named material's other fields went: name = %q", got)
	}
	if _, kept := after.Build.Materials["35"]; !kept {
		t.Fatal("the material the write never mentioned was lost")
	}
	if !after.MetaData.CreatedAt.Equal(stored.MetaData.CreatedAt) {
		t.Fatalf("createdAt moved from %v to %v",
			stored.MetaData.CreatedAt, after.MetaData.CreatedAt)
	}
	if after.MetaData.Revision != stored.MetaData.Revision+1 {
		t.Fatalf("revision = %d, want %d — a write moves the document on by one",
			after.MetaData.Revision, stored.MetaData.Revision+1)
	}
}

func TestLive_AStaleCorpusWriteIsRefused(t *testing.T) {
	s := newPlannerScope(t)
	corpus := loadJobWriteCorpus(t)

	var seed models.Job
	if err := jsoncodec.Unmarshal(corpus.Job, &seed); err != nil {
		t.Fatalf("read the corpus job: %v", err)
	}
	seed.JobID = "job-fixture-stale"
	seed.MetaData.Revision = 0
	if rec := s.putJobs([]models.Job{seed}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	readAt := storedJob(t, s, seed.JobID).MetaData.Revision

	write := corpus.Write
	write.JobID = seed.JobID
	write.Revision = readAt
	if rec := s.putWrites([]models.JobWriteBody{write}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("the first write was refused: %d — %s", rec.Code, rec.Body.String())
	}

	rec := s.putWrites([]models.JobWriteBody{write}, s.account, s.handle)

	if rec.Code != http.StatusConflict {
		t.Fatalf("the stale write = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	body := decodeConflict(t, rec.Body.Bytes())
	if len(body.Rejected) != 1 || body.Rejected[0].DocID != seed.JobID {
		t.Fatalf("rejected = %+v, want the one stale write", body.Rejected)
	}
	if body.Rejected[0].Expected != readAt {
		t.Fatalf("expected = %d, want the revision the write named (%d)",
			body.Rejected[0].Expected, readAt)
	}
}
