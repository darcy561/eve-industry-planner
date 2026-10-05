package jobdocuments

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/shared/stackservices"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	lockGateSaverSession = "eip-live-lock-gate-saver"
	lockGateOtherSession = "eip-live-lock-gate-other"
	lockGateGroupID      = "eip-live-lock-gate-group"
)

type lockGateRename struct {
	jobID string
	name  string
}

type lockHeldBody struct {
	Error       string   `json:"error"`
	Saved       int      `json:"saved"`
	SavedDocIDs []string `json:"savedDocIDs"`
	Rejected    []struct {
		DocID               string `json:"docID"`
		HolderParticipantID string `json:"holderParticipantID"`
	} `json:"rejected"`
}

func (s *plannerScope) seedLockGateJobs(t *testing.T, jobIDs ...string) *eipredis.Redis {
	t.Helper()
	jobs := make([]models.Job, 0, len(jobIDs))
	for _, id := range jobIDs {
		jobs = append(jobs, plannerScopeJob(id))
	}
	if rec := s.putJobs(jobs, s.account, s.handle); rec.Code >= http.StatusBadRequest {
		t.Fatalf("seed write = %d: %s", rec.Code, rec.Body.String())
	}

	redis := stackRedis(t)
	s.h = New(apideps.FromClients(&stackservices.Clients{Mongo: s.mongo, Redis: redis}, s.cipher, nil, nil))
	return redis
}

func (s *plannerScope) holdLock(t *testing.T, redis *eipredis.Redis, accountID, sessionID, collection, docID string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := documentlock.NewService(documentlock.Deps{Redis: redis}).
		Acquire(ctx, s.owner, accountID, sessionID, collection, docID)
	if err != nil {
		t.Fatalf("acquire %s/%s: %v", collection, docID, err)
	}
	if result.StatusCode != http.StatusCreated {
		t.Fatalf("acquire %s/%s = %d, want it granted: %v", collection, docID, result.StatusCode, result.Payload)
	}
	t.Cleanup(func() {
		_ = documentlock.DeleteDocLock(context.Background(), redis, s.owner, collection, docID)
	})
}

func (s *plannerScope) renameAs(t *testing.T, sessionID string, renames ...lockGateRename) *httptest.ResponseRecorder {
	t.Helper()
	writes := make([]models.JobWriteBody, 0, len(renames))
	for _, rename := range renames {
		writes = append(writes, models.JobWriteBody{
			JobID:    rename.jobID,
			Revision: storedRevision(t, s, rename.jobID),
			Document: loopDocumentNaming(t, rename.name),
		})
	}
	return s.putWritesAsSession(writes, s.account, s.handle, sessionID, "")
}

func decodeLockHeld(t *testing.T, rec *httptest.ResponseRecorder) lockHeldBody {
	t.Helper()
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409: %s", rec.Code, rec.Body.String())
	}
	var parsed lockHeldBody
	if err := jsoncodec.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("decode 409 body: %v — %s", err, rec.Body.String())
	}
	if parsed.Error != documentlock.ErrCodeLockHeldElsewhere {
		t.Fatalf("error = %q, want %q", parsed.Error, documentlock.ErrCodeLockHeldElsewhere)
	}
	return parsed
}

func assertStoredName(t *testing.T, s *plannerScope, jobID, want string) {
	t.Helper()
	if got := storedJob(t, s, jobID).Name; got != want {
		t.Errorf("%s is stored named %q, want %q", jobID, got, want)
	}
}

func TestLive_LockGate_aJobHeldElsewhereIsLeftAndTheRestOfTheBatchWritten(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "lock-gate-held", "lock-gate-free")
	s.holdLock(t, redis, plannerScopeOtherAccount, lockGateOtherSession, eipmongo.CollectionJobDocuments, "lock-gate-held")
	heldAt := storedRevision(t, s, "lock-gate-held")

	body := decodeLockHeld(t, s.renameAs(t, lockGateSaverSession,
		lockGateRename{jobID: "lock-gate-held", name: "renamed past the lock"},
		lockGateRename{jobID: "lock-gate-free", name: "renamed beside it"},
	))

	if body.Saved != 1 || !slices.Equal(body.SavedDocIDs, []string{"lock-gate-free"}) {
		t.Errorf("saved %d %v, want only the free job", body.Saved, body.SavedDocIDs)
	}
	if len(body.Rejected) != 1 || body.Rejected[0].DocID != "lock-gate-held" ||
		body.Rejected[0].HolderParticipantID != documentlock.ParticipantID(lockGateOtherSession) {
		t.Errorf("rejected %+v, want the held job named with its holder", body.Rejected)
	}
	assertStoredName(t, s, "lock-gate-free", "renamed beside it")
	assertStoredName(t, s, "lock-gate-held", plannerScopeJob("lock-gate-held").Name)
	if got := storedRevision(t, s, "lock-gate-held"); got != heldAt {
		t.Errorf("held job moved to revision %d from %d", got, heldAt)
	}
}

func TestLive_LockGate_theHoldersOwnWriteIsNotHeldBack(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "lock-gate-mine")
	s.holdLock(t, redis, s.account, lockGateSaverSession, eipmongo.CollectionJobDocuments, "lock-gate-mine")

	rec := s.renameAs(t, lockGateSaverSession,
		lockGateRename{jobID: "lock-gate-mine", name: "renamed by its holder"})

	if rec.Code >= http.StatusBadRequest {
		t.Fatalf("holder's write = %d: %s", rec.Code, rec.Body.String())
	}
	assertStoredName(t, s, "lock-gate-mine", "renamed by its holder")
}

func TestLive_LockGate_aBatchWhollyHeldElsewhereWritesNothing(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "lock-gate-first", "lock-gate-second")
	for _, id := range []string{"lock-gate-first", "lock-gate-second"} {
		s.holdLock(t, redis, plannerScopeOtherAccount, lockGateOtherSession, eipmongo.CollectionJobDocuments, id)
	}

	body := decodeLockHeld(t, s.renameAs(t, lockGateSaverSession,
		lockGateRename{jobID: "lock-gate-first", name: "renamed past the lock"},
		lockGateRename{jobID: "lock-gate-second", name: "renamed past the lock"},
	))

	if body.Saved != 0 || len(body.SavedDocIDs) != 0 || len(body.Rejected) != 2 {
		t.Errorf("saved %d %v rejected %+v, want nothing saved and both named", body.Saved, body.SavedDocIDs, body.Rejected)
	}
	for _, id := range []string{"lock-gate-first", "lock-gate-second"} {
		assertStoredName(t, s, id, plannerScopeJob(id).Name)
	}
}

func TestLive_LockGate_holdingTheGroupDoesNotWriteAMemberJobHeldElsewhere(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "lock-gate-member")
	s.holdLock(t, redis, s.account, lockGateSaverSession, eipmongo.CollectionJobGroups, lockGateGroupID)
	s.holdLock(t, redis, plannerScopeOtherAccount, lockGateOtherSession, eipmongo.CollectionJobDocuments, "lock-gate-member")

	body := decodeLockHeld(t, s.renameAs(t, lockGateSaverSession, lockGateRename{
		jobID: "lock-gate-member", name: "renamed by the group's holder",
	}))

	if len(body.Rejected) != 1 || body.Rejected[0].DocID != "lock-gate-member" ||
		body.Rejected[0].HolderParticipantID != documentlock.ParticipantID(lockGateOtherSession) {
		t.Errorf("rejected %+v, want the member job named with its own holder", body.Rejected)
	}
	assertStoredName(t, s, "lock-gate-member", plannerScopeJob("lock-gate-member").Name)
}

func TestLive_LockGate_takingTheGroupLeavesAMemberJobWithItsHolder(t *testing.T) {
	s := newPlannerScope(t)
	redis := s.seedLockGateJobs(t, "lock-gate-member")
	if _, err := s.mongo.Groups.BulkUpsertGroups(context.Background(), s.owner, s.account, []models.Group{{
		GroupID: lockGateGroupID, GroupName: "Lock gate group", IncludedJobIDs: []string{"lock-gate-member"},
	}}, time.Now().UTC(), "", ""); err != nil {
		t.Fatalf("seed group: %v", err)
	}
	t.Cleanup(func() {
		_, _ = s.mongo.Groups.Collection().DeleteMany(context.Background(),
			bson.M{"_id": eipmongo.OwnerScopedDocumentID(s.owner, lockGateGroupID)})
	})
	s.holdLock(t, redis, plannerScopeOtherAccount, lockGateOtherSession, eipmongo.CollectionJobDocuments, "lock-gate-member")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	granted, err := documentlock.NewService(documentlock.Deps{Redis: redis, NATS: nats(t)}).
		Acquire(ctx, s.owner, s.account, lockGateSaverSession, eipmongo.CollectionJobGroups, lockGateGroupID)
	if err != nil || granted.StatusCode != http.StatusCreated {
		t.Fatalf("acquire the group = %v %v, want it granted", granted, err)
	}
	t.Cleanup(func() {
		_ = documentlock.DeleteDocLock(context.Background(), redis, s.owner, eipmongo.CollectionJobGroups, lockGateGroupID)
	})

	held, err := documentlock.GetLock(ctx, redis, s.owner, eipmongo.CollectionJobDocuments, "lock-gate-member")
	if err != nil || held == nil || held.HolderSessionID != lockGateOtherSession {
		t.Fatalf("member job lock = %+v %v, want it still held by %s", held, err, lockGateOtherSession)
	}
}
