package documentlock

import (
	"context"
	"testing"

	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

func TestStripPassiveViewerOnHolderGrant_removesPromotedSession(t *testing.T) {
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()
	const holder = "sess-holder"
	const viewer = "sess-viewer"

	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, LockRecord{
		HolderSessionID: holder,
		AccountID:       testAccountID,
		LeaseMode:       LeaseModeContested,
	}); err != nil {
		t.Fatalf("SetLock: %v", err)
	}
	if _, err := AddViewer(ctx, rdb, testOwner, testCollection, testDocID, viewer); err != nil {
		t.Fatalf("AddViewer viewer: %v", err)
	}
	if _, err := AddViewer(ctx, rdb, testOwner, testCollection, testDocID, holder); err != nil {
		t.Fatalf("AddViewer holder-as-viewer: %v", err)
	}

	k := ViewerPresenceKey(testOwner, testCollection, testDocID)
	raw, err := rdb.Driver().ZCard(ctx, k).Result()
	if err != nil || raw != 2 {
		t.Fatalf("zcard before = %d, want 2", raw)
	}
	vc, err := PruneAndCountViewers(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("count before: %v", err)
	}
	if vc != 1 {
		t.Fatalf("pruned count before = %d, want 1 (holder not counted)", vc)
	}

	StripPassiveViewerOnHolderGrant(ctx, Deps{Redis: rdb}, testOwner, testCollection, testDocID, holder, false)

	raw, err = rdb.Driver().ZCard(ctx, k).Result()
	if err != nil || raw != 1 {
		t.Fatalf("zcard after = %d, want 1", raw)
	}
	vc, err = PruneAndCountViewers(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("count after: %v", err)
	}
	if vc != 1 {
		t.Fatalf("pruned count after = %d, want 1 (viewer only)", vc)
	}
}
