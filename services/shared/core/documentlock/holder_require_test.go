package documentlock

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/redisfake"
)

func TestCollectLockHeldElsewhereRejects_emptySessionErrors(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	_, err := CollectLockHeldElsewhereRejects(context.Background(), rdb, testAccountID, "", eipmongo.CollectionJobDocuments, []string{"j1"}, nil)
	if err == nil {
		t.Fatal("expected error for empty session")
	}
}

func TestCollectLockHeldElsewhereRejects_noRedis(t *testing.T) {
	t.Parallel()
	got, err := CollectLockHeldElsewhereRejects(context.Background(), nil, testAccountID, "sess-a", eipmongo.CollectionJobDocuments, []string{"j1"}, nil)
	if err != nil || got != nil {
		t.Fatalf("expected nil,nil without redis, got %v err=%v", got, err)
	}
}

func TestCollectLockHeldElsewhereRejects_rejectsOtherHolder(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	ctx := context.Background()
	seedLock(t, rdb, testAccountID, eipmongo.CollectionJobDocuments, "j-x", LockRecord{
		HolderSessionID: "sess-other",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	rej, err := CollectLockHeldElsewhereRejects(ctx, rdb, testAccountID, "sess-me", eipmongo.CollectionJobDocuments, []string{"j-x", "j-free"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(rej) != 1 || rej[0].DocID != "j-x" || rej[0].HolderSessionID != "sess-other" {
		t.Fatalf("unexpected rejects: %+v", rej)
	}
}

func TestCollectLockHeldElsewhereRejects_groupHolderBypassesJobLock(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	ctx := context.Background()
	const groupID = "group-1"
	seedLock(t, rdb, testAccountID, eipmongo.CollectionJobDocuments, "j-member", LockRecord{
		HolderSessionID: "sess-other",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	seedLock(t, rdb, testAccountID, eipmongo.CollectionJobGroups, groupID, LockRecord{
		HolderSessionID: "sess-me",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	bypass := JobGroupBypass{"j-member": groupID}
	rej, err := CollectLockHeldElsewhereRejects(ctx, rdb, testAccountID, "sess-me", eipmongo.CollectionJobDocuments, []string{"j-member"}, bypass)
	if err != nil {
		t.Fatal(err)
	}
	if len(rej) != 0 {
		t.Fatalf("group holder should bypass per-job lock, got %+v", rej)
	}
}

func TestDecodeLockRecordFromRedisString_expired(t *testing.T) {
	t.Parallel()
	rec := LockRecord{HolderSessionID: "a", ExpiresAtUnix: 1}
	b, _ := json.Marshal(rec)
	_, expired := decodeLockRecordFromRedisString(string(b), 9999999999)
	if !expired {
		t.Fatal("expected expired")
	}
}
