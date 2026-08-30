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

	"github.com/redis/go-redis/v9"
)

const (
	lockTestAccount = "account-1"
	lockTestSession = "sess-restoring"
	lockTestOther   = "sess-editing"
)

func handlersWithRedis(t *testing.T, rdb *redis.Client) *Handlers {
	t.Helper()
	h := New(&apideps.Deps{})
	h.locks.Redis = rdb
	return h
}

func seedLock(t *testing.T, rdb *redis.Client, collection, docID, holder string) {
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
	key := documentlock.LockKey(lockTestAccount, collection, docID)
	if err := rdb.Set(context.Background(), key, b, time.Minute).Err(); err != nil {
		t.Fatalf("seed lock: %v", err)
	}
}

func archivedMemberOf(jobID, groupID string) models.Job {
	return models.Job{JobID: jobID, GroupID: groupID, IncludedInGroup: true}
}

// A second session with the group open holds its lock. Restoring into that group
// rewrites the document under them, so the restore is refused rather than racing
// the group save that session will make.
func TestRestoreIsRefusedWhileAnotherSessionHoldsTheGroup(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobGroups, "group-1", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionAccountJobGroups {
		t.Fatalf("collection = %q, want the group named", collection)
	}
	if len(rejects) != 1 || rejects[0].DocID != "group-1" {
		t.Fatalf("rejects = %+v, want group-1 held by another session", rejects)
	}
	if rejects[0].HolderSessionID != lockTestOther {
		t.Fatalf("holder = %q", rejects[0].HolderSessionID)
	}
}

// The session doing the restore is the one holding the group: nothing to protect
// it from.
func TestRestoreProceedsWhenTheRestoringSessionHoldsTheGroup(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobGroups, "group-1", lockTestSession)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || len(rejects) != 0 {
		t.Fatalf("own lock blocked the restore: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

// A related set can reach several groups; a hold on any one of them refuses the
// whole restore, because the write is one sequence.
func TestRestoreIsRefusedWhenAnyGroupInTheSetIsHeld(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobGroups, "group-2", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession, []models.Job{
		archivedMemberOf("job-a", "group-1"),
		archivedMemberOf("job-b", "group-2"),
	})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionAccountJobGroups || len(rejects) != 1 || rejects[0].DocID != "group-2" {
		t.Fatalf("collection=%q rejects=%+v, want group-2 refused", collection, rejects)
	}
}

// A job with no group has no group lock to stand for it, so it is gated on its
// own document.
func TestRestoreIsRefusedWhileAnotherSessionHoldsTheJob(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobDocuments, "job-a", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{{JobID: "job-a"}})

	if err != nil {
		t.Fatalf("lock gate: %v", err)
	}
	if collection != eipmongo.CollectionAccountJobDocuments || len(rejects) != 1 || rejects[0].DocID != "job-a" {
		t.Fatalf("collection=%q rejects=%+v, want job-a refused", collection, rejects)
	}
}

// While a job is archived its group's lock stands for it, so a lock left on the
// job document itself is not what decides the restore.
func TestAGroupedJobIsGatedOnItsGroupNotItself(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobDocuments, "job-a", lockTestOther)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || len(rejects) != 0 {
		t.Fatalf("a grouped job was gated on its own document: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

// The group's holder owns its archived members, so its own restore proceeds.
func TestTheGroupHolderMayRestoreItsMembers(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	seedLock(t, rdb, eipmongo.CollectionAccountJobGroups, "group-1", lockTestSession)
	h := handlersWithRedis(t, rdb)

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || len(rejects) != 0 {
		t.Fatalf("group holder was refused: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}

// Enforcement needs a session to compare against.
func TestRestoreLockGateRequiresASession(t *testing.T) {
	t.Parallel()
	h := handlersWithRedis(t, redisfake.New(t).Client)

	if _, _, err := h.restoreLockRejects(context.Background(), lockTestAccount, "", []models.Job{{JobID: "job-a"}}); err == nil {
		t.Fatal("expected the gate to require a session")
	}
}

// Without Redis there is no enforcement, matching every other gated route.
func TestRestoreLockGateIsInertWithoutRedis(t *testing.T) {
	t.Parallel()
	h := New(&apideps.Deps{})

	collection, rejects, err := h.restoreLockRejects(context.Background(), lockTestAccount, lockTestSession,
		[]models.Job{archivedMemberOf("job-a", "group-1")})

	if err != nil || collection != "" || rejects != nil {
		t.Fatalf("gate ran without redis: collection=%q rejects=%+v err=%v", collection, rejects, err)
	}
}
