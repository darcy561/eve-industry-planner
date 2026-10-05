package documentlock

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

func TestCollectLockHeldElsewhereRejects_emptySessionErrors(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	_, err := CollectLockHeldElsewhereRejects(context.Background(), rdb, testOwner, "", eipmongo.CollectionJobDocuments, []string{"j1"})
	if err == nil {
		t.Fatal("expected error for empty session")
	}
}

func TestCollectLockHeldElsewhereRejects_noRedis(t *testing.T) {
	t.Parallel()
	got, err := CollectLockHeldElsewhereRejects(context.Background(), nil, testOwner, "sess-a", eipmongo.CollectionJobDocuments, []string{"j1"})
	if err != nil || got != nil {
		t.Fatalf("expected nil,nil without redis, got %v err=%v", got, err)
	}
}

func TestCollectLockHeldElsewhereRejects_rejectsOtherHolder(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	seedLock(t, rdb, testOwner, eipmongo.CollectionJobDocuments, "j-x", LockRecord{
		HolderSessionID: "sess-other",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	rej, err := CollectLockHeldElsewhereRejects(ctx, rdb, testOwner, "sess-me", eipmongo.CollectionJobDocuments, []string{"j-x", "j-free"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rej) != 1 || rej[0].DocID != "j-x" || rej[0].HolderParticipantID != ParticipantID("sess-other") {
		t.Fatalf("unexpected rejects: %+v", rej)
	}
}

func TestCollectLockHeldElsewhereRejects_holdingTheGroupDoesNotReachAMemberJobHeldElsewhere(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	seedLock(t, rdb, testOwner, eipmongo.CollectionJobDocuments, "j-member", LockRecord{
		HolderSessionID: "sess-other",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	seedLock(t, rdb, testOwner, eipmongo.CollectionJobGroups, "group-1", LockRecord{
		HolderSessionID: "sess-me",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})
	rej, err := CollectLockHeldElsewhereRejects(ctx, rdb, testOwner, "sess-me", eipmongo.CollectionJobDocuments, []string{"j-member"})
	if err != nil {
		t.Fatal(err)
	}
	if len(rej) != 1 || rej[0].DocID != "j-member" || rej[0].HolderParticipantID != ParticipantID("sess-other") {
		t.Fatalf("rejects = %+v, want the member job named with its own holder", rej)
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
