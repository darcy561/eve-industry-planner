package archivedjobs

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

const (
	lockTestAccount = "account-1"
)

var lockTestOwner = models.AccountOwner(lockTestAccount)

const (
	lockTestSession = "sess-restoring"
	lockTestOther   = "sess-editing"
)

func handlersWithRedis(t *testing.T, rdb *eipredis.Redis) *Handlers {
	t.Helper()
	h := New(&apideps.Deps{})
	h.locks.Redis = rdb
	return h
}

func seedLock(t *testing.T, rdb *eipredis.Redis, collection, docID, holder string) {
	t.Helper()
	rec := documentlock.LockRecord{
		HolderSessionID: holder,
		AccountID:       lockTestAccount,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	}
	b, err := json.Marshal(rec)
	if err != nil {
		t.Fatalf("marshal lock: %v", err)
	}
	key := documentlock.LockKey(lockTestOwner, collection, docID)
	if err := rdb.Driver().Set(context.Background(), key, b, time.Minute).Err(); err != nil {
		t.Fatalf("seed lock: %v", err)
	}
}

func archivedMemberOf(jobID, groupID string) models.Job {
	return models.Job{JobID: jobID, GroupID: groupID, IncludedInGroup: true}
}

func TestRestoreIsRefusedWhileAnotherSessionHoldsTheGroup(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobGroups, "group-1", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionJobGroups {
		t.Fatalf("collection = %q, want the group named", collection)
	}
	if len(rejects) != 1 || rejects[0].DocID != "group-1" {
		t.Fatalf("rejects = %+v, want group-1 held by another session", rejects)
	}
	if rejects[0].HolderParticipantID != documentlock.ParticipantID(lockTestOther) {
		t.Fatalf("holder = %q", rejects[0].HolderParticipantID)
	}
}

func TestRestoreProceedsWhenTheRestoringSessionHoldsTheGroup(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobGroups, "group-1", lockTestSession)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || len(rejects) != 0 {
		t.Fatalf("own lock blocked the restore: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

func TestRestoreIsRefusedWhenAnyGroupInTheSetIsHeld(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobGroups, "group-2", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession, []models.Job{
		archivedMemberOf("job-a", "group-1"),
		archivedMemberOf("job-b", "group-2"),
	})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionJobGroups || len(rejects) != 1 || rejects[0].DocID != "group-2" {
		t.Fatalf("collection=%q rejects=%+v, want group-2 refused", collection, rejects)
	}
}

func TestRestoreIsRefusedWhileAnotherSessionHoldsTheJob(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobDocuments, "job-a", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{{JobID: "job-a"}})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionJobDocuments || len(rejects) != 1 || rejects[0].DocID != "job-a" {
		t.Fatalf("collection=%q rejects=%+v, want job-a refused", collection, rejects)
	}
}

func TestAGroupedJobIsGatedOnItselfAsWellAsItsGroup(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobDocuments, "job-a", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != eipmongo.CollectionJobDocuments || len(rejects) != 1 || rejects[0].DocID != "job-a" {
		t.Fatalf("a grouped job held elsewhere was restored: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

func TestTheGroupHolderMayRestoreItsMembers(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	seedLock(t, rdb, eipmongo.CollectionJobGroups, "group-1", lockTestSession)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || len(rejects) != 0 {
		t.Fatalf("group holder was refused: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

func TestRestoreLockGateRequiresASession(t *testing.T) {
	t.Parallel()
	h := handlersWithRedis(t, eipredis.NewRedis(redisfake.New(t).Client))

	if _, _, err := h.restoreLockRejects(context.Background(), lockTestOwner, "", []models.Job{{JobID: "job-a"}}); err == nil {
		t.Fatal("expected the gate to require a session")
	}
}

func TestRestoreLockGateIsInertWithoutRedis(t *testing.T) {
	t.Parallel()
	h := New(&apideps.Deps{})

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestOwner, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || rejects != nil {
		t.Fatalf("gate ran without redis: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}
