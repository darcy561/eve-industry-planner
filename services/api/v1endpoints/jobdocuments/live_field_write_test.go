// The write the SPA builds, driven through the real handler into real Mongo.
//
// Every other test of this path checks one side of a seam: the SPA's tests say
// what it emits, the corpus tests say the model accepts that shape, and the
// Mongo tests say an update built by hand stores what it names. None of them
// runs the bytes a save really sends against the endpoint that really answers
// it, which is where a field-scoped write has the most to go wrong — it names
// paths into a stored document rather than replacing one.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
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

// storedJob is the document as it now stands.
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

// putWrites sends writes as they arrive from a client, rather than building them
// around a job the way [plannerScope.putJobs] does.
func (s *plannerScope) putWrites(writes []models.JobWriteBody, accountID, plannerHandle string) *httptest.ResponseRecorder {
	s.t.Helper()
	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.request(http.MethodPut, "/api/v1/job-documents",
		map[string]any{"jobs": writes}, accountID, plannerHandle))
	return rec
}

// The whole seam in one test: the corpus write goes in as a client sends it, and
// the stored document comes out changed in exactly the ways the write named.
func TestLive_TheCorpusWriteChangesOnlyWhatItNames(t *testing.T) {
	s := newPlannerScope(t)
	corpus := loadJobWriteCorpus(t)

	var seed models.Job
	if err := jsoncodec.Unmarshal(corpus.Job, &seed); err != nil {
		t.Fatalf("read the corpus job: %v", err)
	}
	// The row the write removes is seeded here and nowhere in the corpus job: a
	// removal names a row the reader's copy no longer has, so the fixture cannot
	// carry it and the document must.
	seed.Build.ExtrasCosts["e-2"] = models.ExtraCost{ID: "e-2", ExtraText: "Deleted by the reader", ExtraValue: 500}
	seed.Name = "before the write"
	seed.Build.Materials["34"] = models.JobMaterial{TypeID: 34, Name: "Tritanium", Volume: 1}
	// The corpus job stands at the revision its write is checked against. Seeding
	// it is a create, which has none — carrying one would check the create
	// against a document that does not exist yet.
	seed.MetaData.Revision = 0

	if rec := s.putJobs([]models.Job{seed}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
	stored := storedJob(t, s, seed.JobID)
	if _, seeded := stored.Build.ExtrasCosts["e-2"]; !seeded {
		t.Fatal("the seed stored no row for the write to remove, so removing it would prove nothing")
	}

	// The client writes from the document it read, which is where it now stands.
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

	// What the write did not name has to be exactly as it was. A field-scoped
	// write that replaced the document would pass every assertion above.
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

// The same write sent twice: the second names a revision the document has moved
// past, and is refused. This is what stops two members overwriting each other,
// exercised through the shape a client really sends rather than one built here.
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
