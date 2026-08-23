package documentlock

import (
	"context"
	"testing"

	"eve-industry-planner/testing/redisfake"
)

func TestStripPassiveViewerOnHolderGrant_removesPromotedSession(t *testing.T) {
	rdb := redisfake.New(t).Client
	ctx := context.Background()
	const holder = "sess-holder"
	const viewer = "sess-viewer"

	if err := SetLock(ctx, rdb, testAccountID, testCollection, testDocID, LockRecord{
		HolderSessionID: holder,
		AccountID:       testAccountID,
		LeaseMode:       LeaseModeContested,
	}); err != nil {
		t.Fatalf("SetLock: %v", err)
	}
	if _, err := AddViewer(ctx, rdb, testAccountID, testCollection, testDocID, viewer); err != nil {
		t.Fatalf("AddViewer viewer: %v", err)
	}
	if _, err := AddViewer(ctx, rdb, testAccountID, testCollection, testDocID, holder); err != nil {
		t.Fatalf("AddViewer holder-as-viewer: %v", err)
	}

	k := ViewerPresenceKey(testAccountID, testCollection, testDocID)
	raw, err := rdb.ZCard(ctx, k).Result()
	if err != nil || raw != 2 {
		t.Fatalf("zcard before = %d, want 2", raw)
	}
	vc, err := PruneAndCountViewers(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("count before: %v", err)
	}
	if vc != 1 {
		t.Fatalf("pruned count before = %d, want 1 (holder not counted)", vc)
	}

	StripPassiveViewerOnHolderGrant(ctx, Deps{Redis: rdb}, testAccountID, testCollection, testDocID, holder, false)

	raw, err = rdb.ZCard(ctx, k).Result()
	if err != nil || raw != 1 {
		t.Fatalf("zcard after = %d, want 1", raw)
	}
	vc, err = PruneAndCountViewers(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("count after: %v", err)
	}
	if vc != 1 {
		t.Fatalf("pruned count after = %d, want 1 (viewer only)", vc)
	}
}
