package jobdocuments

import (
	"encoding/json/jsontext"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

func (s *plannerScope) putOneChange(t *testing.T, sessionID string, writes ...models.JobWriteBody) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.requestAsSession(http.MethodPut, "/api/v1/job-documents",
		models.JobWriteBatch{Jobs: writes, OneChange: true}, s.account, s.handle, sessionID, ""))
	return rec
}

func (s *plannerScope) renameWrite(t *testing.T, jobID, name string) models.JobWriteBody {
	t.Helper()
	return models.JobWriteBody{
		JobID:    jobID,
		Revision: storedRevision(t, s, jobID),
		Document: loopDocumentNaming(t, name),
	}
}

func (s *plannerScope) seedJobs(t *testing.T, jobIDs ...string) {
	t.Helper()
	jobs := make([]models.Job, 0, len(jobIDs))
	for _, id := range jobIDs {
		jobs = append(jobs, plannerScopeJob(id))
	}
	if rec := s.putJobs(jobs, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}
}

func TestLive_OneChange_writesEveryJobInIt(t *testing.T) {
	s := newPlannerScope(t)
	s.seedJobs(t, "one-change-first", "one-change-second")

	rec := s.putOneChange(t, lockGateSaverSession,
		s.renameWrite(t, "one-change-first", "first renamed"),
		s.renameWrite(t, "one-change-second", "second renamed"),
	)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("change = %d, want 204: %s", rec.Code, rec.Body.String())
	}
	assertStoredName(t, s, "one-change-first", "first renamed")
	assertStoredName(t, s, "one-change-second", "second renamed")
}

func TestLive_OneChange_aStaleJobRefusesTheWholeChange(t *testing.T) {
	s := newPlannerScope(t)
	s.seedJobs(t, "one-change-fresh", "one-change-stale")
	fresh := s.renameWrite(t, "one-change-fresh", "fresh renamed")
	stale := s.renameWrite(t, "one-change-stale", "stale renamed")
	if rec := s.putWrites([]models.JobWriteBody{s.renameWrite(t, "one-change-stale", "moved by somebody else")},
		s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("intervening write = %d: %s", rec.Code, rec.Body.String())
	}

	rec := s.putOneChange(t, lockGateSaverSession, fresh, stale)

	if rec.Code != http.StatusConflict {
		t.Fatalf("change = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	body := decodeConflict(t, rec.Body.Bytes())
	if body.Error != "revision_conflict" || body.Saved != 0 {
		t.Errorf("error %q saved %d, want a revision conflict with nothing saved", body.Error, body.Saved)
	}
	if len(body.Rejected) != 1 || body.Rejected[0].DocID != "one-change-stale" ||
		body.Rejected[0].Current != storedRevision(t, s, "one-change-stale") {
		t.Errorf("rejected %+v, want the stale job at its current revision", body.Rejected)
	}
	assertStoredName(t, s, "one-change-fresh", plannerScopeJob("one-change-fresh").Name)
	assertStoredName(t, s, "one-change-stale", "moved by somebody else")
}

func TestLive_OneChange_aJobHeldElsewhereRefusesTheWholeChange(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "one-change-held", "one-change-free")
	s.holdLock(t, redis, plannerScopeOtherAccount, lockGateOtherSession, eipmongo.CollectionJobDocuments, "one-change-held")

	body := decodeLockHeld(t, s.putOneChange(t, lockGateSaverSession,
		s.renameWrite(t, "one-change-held", "renamed past the lock"),
		s.renameWrite(t, "one-change-free", "renamed beside it"),
	))

	if body.Saved != 0 || len(body.SavedDocIDs) != 0 {
		t.Errorf("saved %d %v, want nothing saved", body.Saved, body.SavedDocIDs)
	}
	if len(body.Rejected) != 1 || body.Rejected[0].DocID != "one-change-held" {
		t.Errorf("rejected %+v, want the held job named", body.Rejected)
	}
	assertStoredName(t, s, "one-change-free", plannerScopeJob("one-change-free").Name)
	assertStoredName(t, s, "one-change-held", plannerScopeJob("one-change-held").Name)
}

func TestLive_OneChange_aWriteThatCannotBeReadRefusesTheWholeChange(t *testing.T) {
	s := newPlannerScope(t)
	s.seedJobs(t, "one-change-readable", "one-change-unreadable")
	unreadable := s.renameWrite(t, "one-change-unreadable", "")
	unreadable.Document = jsontext.Value(`{"name":5}`)

	rec := s.putOneChange(t, lockGateSaverSession,
		s.renameWrite(t, "one-change-readable", "renamed"), unreadable)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("change = %d, want 400: %s", rec.Code, rec.Body.String())
	}
	assertStoredName(t, s, "one-change-readable", plannerScopeJob("one-change-readable").Name)
	if revisions := []int64{storedRevision(t, s, "one-change-readable"), storedRevision(t, s, "one-change-unreadable")}; !slices.Equal(revisions, []int64{1, 1}) {
		t.Errorf("revisions %v, want neither job written", revisions)
	}
}

func TestLive_OneChange_isNotSplitByTheBatchLimit(t *testing.T) {
	s := newPlannerScope(t)
	writes := make([]models.JobWriteBody, 0, 101)
	for i := range 101 {
		writes = append(writes, models.JobWriteBody{
			JobID:    fmt.Sprintf("one-change-large-%03d", i),
			Document: loopDocumentNaming(t, "created in one change"),
		})
	}

	rec := s.putOneChange(t, lockGateSaverSession, writes...)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("change of %d jobs = %d, want 204: %s", len(writes), rec.Code, rec.Body.String())
	}
	assertStoredName(t, s, "one-change-large-100", "created in one change")
}
