// A job written into a shared planner, end to end over the handlers.
//
// Everything else exercises the account's own planner, where the owner on the
// request and the account are the same value — so a filter that used one in
// place of the other still answered correctly. These write into a corporation
// planner, where the two differ and a mistake shows.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
package jobdocuments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	sessionreq "eve-industry-planner/shared/plannersession/request"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/keys"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	plannerScopeAccount      = "eip-parity-planner-scope-account"
	plannerScopeOtherAccount = "eip-parity-planner-scope-outsider"
	plannerScopeCorpID       = 98000123
)

// plannerScope is the handlers with real Mongo behind them, plus the corporation
// planner the tests write into.
type plannerScope struct {
	t       *testing.T
	h       *Handlers
	mongo   *eipmongo.Mongo
	cipher  *entityid.Cipher
	owner   models.Owner
	handle  string
	account string
}

func newPlannerScope(t *testing.T) *plannerScope {
	t.Helper()
	mongo := mongolive.Require(t)
	cipher := keys.EntityCipher(t)

	ref, err := cipher.Corporation(plannerScopeCorpID)
	if err != nil {
		t.Fatalf("encrypt corporation: %v", err)
	}
	owner := models.CorporationOwner(ref)
	handle, err := models.OwnerHandle(owner, cipher)
	if err != nil {
		t.Fatalf("owner handle: %v", err)
	}

	deps := apideps.FromClients(&stackservices.Clients{Mongo: mongo}, cipher, nil, nil)

	s := &plannerScope{
		t: t, h: New(deps), mongo: mongo, cipher: cipher,
		owner: owner, handle: handle, account: plannerScopeAccount,
	}

	mongolive.ScratchAccount(t, mongo, plannerScopeAccount)
	mongolive.ScratchAccount(t, mongo, plannerScopeOtherAccount)
	s.clearPlanner()
	t.Cleanup(s.clearPlanner)

	// The account reaches the planner because it holds a membership row, which is
	// what an ESI reconcile writes.
	if _, _, err := mongo.ReconcileEntityMemberships(context.Background(),
		plannerScopeAccount, []models.Owner{owner}, time.Now().UTC()); err != nil {
		t.Fatalf("seed membership: %v", err)
	}
	return s
}

// ScratchAccount cleans what an account owns; a corporation planner's documents
// and the membership rows pointing at it are this test's to remove.
func (s *plannerScope) clearPlanner() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	scope := bson.M{
		eipmongo.FieldMetaOwnerKind: s.owner.Kind,
		eipmongo.FieldMetaOwnerID:   s.owner.ID,
	}
	for _, docs := range []*eipmongo.Docs{s.mongo.JobDocuments, s.mongo.Groups, s.mongo.ArchivedJobs} {
		_, _ = docs.Collection().DeleteMany(ctx, scope)
	}
	_, _ = s.mongo.PlannerMemberships.Collection().DeleteMany(ctx,
		bson.M{"plannerID": s.owner.Key()})
}

// request binds the identity the auth middleware would, and names the planner
// the way a client does.
func (s *plannerScope) request(method, path string, body any, accountID, plannerHandle string) *http.Request {
	s.t.Helper()

	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			s.t.Fatalf("encode request: %v", err)
		}
		payload = encoded
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	if plannerHandle != "" {
		r.Header.Set(helper.PlannerOwnerHeader, plannerHandle)
	}
	return r.WithContext(sessionreq.WithIdentity(r.Context(), accountID, "sess-planner-scope"))
}

func (s *plannerScope) putJobs(jobs []models.Job, accountID, plannerHandle string) *httptest.ResponseRecorder {
	s.t.Helper()
	rec := httptest.NewRecorder()
	s.h.PutJobDocumentsHandler(rec, s.request(http.MethodPut, "/api/v1/job-documents",
		map[string]any{"jobs": jobs}, accountID, plannerHandle))
	return rec
}

func (s *plannerScope) plannerJobs(accountID, plannerHandle string) (*httptest.ResponseRecorder, []models.Job) {
	s.t.Helper()
	rec := httptest.NewRecorder()
	s.h.GetPlannerJobDocumentsHandler(rec,
		s.request(http.MethodGet, "/api/v1/job-documents/planner", nil, accountID, plannerHandle))
	if rec.Code != http.StatusOK {
		return rec, nil
	}
	var jobs []models.Job
	if err := json.Unmarshal(rec.Body.Bytes(), &jobs); err != nil {
		s.t.Fatalf("decode jobs: %v (%s)", err, rec.Body.String())
	}
	return rec, jobs
}

func plannerScopeJob(jobID string) models.Job {
	return models.Job{
		JobID: jobID, Name: "shared planner job", ItemID: 34, JobType: 0,
		DisplayOnPlanner: true,
	}
}

// The round trip this whole slice exists for: a job written into a corporation
// planner is stored under that planner and read back through it.
func TestLive_JobWrittenIntoAPlannerIsReadBackFromIt(t *testing.T) {
	s := newPlannerScope(t)

	if rec := s.putJobs([]models.Job{plannerScopeJob("planner-scope-1")},
		s.account, s.handle); rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("write = %d, want a success: %s", rec.Code, rec.Body.String())
	}

	rec, jobs := s.plannerJobs(s.account, s.handle)
	if rec.Code != http.StatusOK {
		t.Fatalf("read = %d: %s", rec.Code, rec.Body.String())
	}
	if len(jobs) != 1 || jobs[0].JobID != "planner-scope-1" {
		t.Fatalf("planner holds %d jobs, want the one written", len(jobs))
	}

	// Stored under the planner, not the account that wrote it.
	var stored models.Job
	if err := s.mongo.JobDocuments.Collection().
		FindOne(context.Background(), bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, "planner-scope-1")}).Decode(&stored); err != nil {
		t.Fatalf("read the stored job: %v", err)
	}
	if stored.MetaData.Owner != s.owner {
		t.Errorf("stored owner = %v, want the corporation planner", stored.MetaData.Owner)
	}
	if stored.MetaData.LastUpdatedBy != s.account {
		t.Errorf("lastUpdatedBy = %q, want the writing account", stored.MetaData.LastUpdatedBy)
	}
}

// The account's own planner does not see what was written into the shared one.
// This is the assertion every account-owner test could not make.
func TestLive_APlannersJobsStayOutOfTheAccountsOwnPlanner(t *testing.T) {
	s := newPlannerScope(t)

	if rec := s.putJobs([]models.Job{plannerScopeJob("planner-scope-2")},
		s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("write = %d: %s", rec.Code, rec.Body.String())
	}

	// No planner header: the account's own.
	rec, jobs := s.plannerJobs(s.account, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("read = %d: %s", rec.Code, rec.Body.String())
	}
	for _, job := range jobs {
		if job.JobID == "planner-scope-2" {
			t.Fatal("a shared planner's job appeared in the account's own planner")
		}
	}
}

// An account holding no membership row for the planner is refused, and told
// nothing about whether it exists.
func TestLive_APlannerTheAccountCannotReachIsRefused(t *testing.T) {
	s := newPlannerScope(t)

	if rec := s.putJobs([]models.Job{plannerScopeJob("planner-scope-3")},
		plannerScopeOtherAccount, s.handle); rec.Code != http.StatusNotFound {
		t.Fatalf("write by an outsider = %d, want %d: %s",
			rec.Code, http.StatusNotFound, rec.Body.String())
	}

	rec, _ := s.plannerJobs(plannerScopeOtherAccount, s.handle)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("read by an outsider = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// Two members of one planner both reach the same job, which is the point of a
// shared planner.
func TestLive_ASecondMemberReadsTheSameJob(t *testing.T) {
	s := newPlannerScope(t)

	if _, _, err := s.mongo.ReconcileEntityMemberships(context.Background(),
		plannerScopeOtherAccount, []models.Owner{s.owner}, time.Now().UTC()); err != nil {
		t.Fatalf("seed the second membership: %v", err)
	}

	if rec := s.putJobs([]models.Job{plannerScopeJob("planner-scope-4")},
		s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("write = %d: %s", rec.Code, rec.Body.String())
	}

	rec, jobs := s.plannerJobs(plannerScopeOtherAccount, s.handle)
	if rec.Code != http.StatusOK {
		t.Fatalf("second member read = %d: %s", rec.Code, rec.Body.String())
	}
	if len(jobs) != 1 || jobs[0].JobID != "planner-scope-4" {
		t.Fatalf("second member sees %d jobs, want the one written", len(jobs))
	}
}

// Every write counts itself, so a conditional write has something to compare.
func TestLive_AWriteIncrementsTheDocumentVersion(t *testing.T) {
	s := newPlannerScope(t)
	job := plannerScopeJob("planner-scope-5")

	version := func() int64 {
		var stored models.Job
		if err := s.mongo.JobDocuments.Collection().
			FindOne(context.Background(), bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, job.JobID)}).Decode(&stored); err != nil {
			t.Fatalf("read the stored job: %v", err)
		}
		return stored.MetaData.Revision
	}

	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("first write = %d: %s", rec.Code, rec.Body.String())
	}
	first := version()
	if first != models.InitialDocumentRevision {
		t.Fatalf("version after one write = %d, want %d", first, models.InitialDocumentRevision)
	}

	job.Name = "edited"
	if rec := s.putJobs([]models.Job{job}, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("second write = %d: %s", rec.Code, rec.Body.String())
	}
	if second := version(); second != first+1 {
		t.Fatalf("version after two writes = %d, want %d", second, first+1)
	}
}

// A handle the cipher cannot read is a bad request rather than a silent fall
// back to the account's own planner, which would write into the wrong one.
func TestLive_AnUnreadablePlannerHandleIsRefused(t *testing.T) {
	s := newPlannerScope(t)

	rec := s.putJobs([]models.Job{plannerScopeJob("planner-scope-6")}, s.account, "corporation:not-a-ref")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("write with an unreadable handle = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}
