package archivedjobs

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	"eve-industry-planner/testing/mongolive"
)

const archiveMoveScratchAccount = "eip-parity-archive-move"

func archiveMoveScratch(t *testing.T, jobIDs ...string) (*Handlers, models.Owner, context.Context) {
	t.Helper()
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	t.Cleanup(cancel)
	mongolive.ScratchAccount(t, mongo, archiveMoveScratchAccount)

	owner := models.AccountOwner(archiveMoveScratchAccount)
	jobs := make([]models.Job, 0, len(jobIDs))
	for _, id := range jobIDs {
		jobs = append(jobs, seedJob(id))
	}
	mongolive.SeedJobs(t, ctx, mongo, owner, archiveMoveScratchAccount, jobs...)
	return restoreHandlers(t, mongo), owner, ctx
}

func putArchive(t *testing.T, h *Handlers, jobs ...models.Job) *httptest.ResponseRecorder {
	t.Helper()
	body, err := jsoncodec.Marshal(map[string]any{"jobs": jobs})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	r := httptest.NewRequest(http.MethodPut, "/api/v1/archived-jobs", bytes.NewReader(body))
	r = r.WithContext(sessionreq.WithIdentity(r.Context(), archiveMoveScratchAccount, "sess-archive"))
	rec := httptest.NewRecorder()
	h.Router(rec, r)
	return rec
}

func TestLive_ArchivingMovesTheJobOffThePlanner(t *testing.T) {
	h, owner, ctx := archiveMoveScratch(t, "archive-move-1")

	rec := putArchive(t, h, mongolive.ReadJob(t, ctx, h.Mongo.JobDocuments, owner, "archive-move-1"))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("archive = %d, want 204: %s", rec.Code, rec.Body.String())
	}
	mongolive.RequireJobAbsent(t, ctx, h.Mongo.JobDocuments, owner, "archive-move-1")
	mongolive.ReadJob(t, ctx, h.Mongo.ArchivedJobs, owner, "archive-move-1")
}

func TestLive_ArchivingAJobEditedSinceItWasReadArchivesNothing(t *testing.T) {
	h, owner, ctx := archiveMoveScratch(t, "archive-move-fresh", "archive-move-edited")
	fresh := mongolive.ReadJob(t, ctx, h.Mongo.JobDocuments, owner, "archive-move-fresh")
	edited := mongolive.ReadJob(t, ctx, h.Mongo.JobDocuments, owner, "archive-move-edited")
	moved := edited
	moved.Name = "edited by somebody else"
	mongolive.SeedJobs(t, ctx, h.Mongo, owner, archiveMoveScratchAccount, moved)

	rec := putArchive(t, h, fresh, edited)

	if rec.Code != http.StatusConflict {
		t.Fatalf("archive = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	for _, jobID := range []string{"archive-move-fresh", "archive-move-edited"} {
		mongolive.RequireJobAbsent(t, ctx, h.Mongo.ArchivedJobs, owner, jobID)
		mongolive.ReadJob(t, ctx, h.Mongo.JobDocuments, owner, jobID)
	}
}
