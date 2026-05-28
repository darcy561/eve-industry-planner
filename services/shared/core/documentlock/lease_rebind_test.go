package documentlock

import (
	"context"
	"testing"
	"time"
)

func TestLeaseRebind_SoloAcquireAndViewerCycle(t *testing.T) {
	t.Parallel()
	svc, rdb, mr := concurrencyTestService(t)
	ctx := context.Background()

	out, err := svc.Acquire(ctx, testAccountID, "holder", testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if out.StatusCode != 201 {
		t.Fatalf("status=%d", out.StatusCode)
	}
	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil || rec == nil {
		t.Fatal("expected lock")
	}
	if rec.LeaseMode != LeaseModeSolo {
		t.Fatalf("leaseMode=%q want solo", rec.LeaseMode)
	}
	key := LockKey(testAccountID, testCollection, testDocID)
	ttl := mr.TTL(key)
	if ttl < SoloHolderLockTTL-time.Minute || ttl > SoloHolderLockTTL {
		t.Fatalf("solo TTL out of range: %v", ttl)
	}

	HandleViewerArrivedIngress(ctx, Deps{Redis: rdb}, testAccountID, "viewer", testCollection, testDocID)
	rec, err = GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil || rec == nil {
		t.Fatal("expected lock after viewer")
	}
	if rec.LeaseMode != LeaseModeContested {
		t.Fatalf("passive viewer must override solo; leaseMode=%q", rec.LeaseMode)
	}
	ttlAfterViewer := mr.TTL(key)
	if ttlAfterViewer > DefaultLockTTL+time.Second || ttlAfterViewer < DefaultLockTTL-time.Minute {
		t.Fatalf("contested TTL out of range after viewer: %v", ttlAfterViewer)
	}

	HandleViewerDepartedIngress(ctx, Deps{Redis: rdb}, testAccountID, "viewer", testCollection, testDocID)
	rec, err = GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil || rec == nil {
		t.Fatal("expected lock after viewer left")
	}
	if rec.LeaseMode != LeaseModeSolo {
		t.Fatalf("leaseMode=%q want solo after uncontested", rec.LeaseMode)
	}
}

func TestLeaseRebind_RequestQueuedContested(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()
	mustAcquire(t, ctx, svc, "holder")

	out, err := svc.RequestAccess(ctx, testAccountID, "requester", testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if out.StatusCode != 202 {
		t.Fatalf("status=%d want 202", out.StatusCode)
	}
	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil || rec == nil {
		t.Fatal("expected lock")
	}
	if rec.LeaseMode != LeaseModeContested {
		t.Fatalf("leaseMode=%q want contested", rec.LeaseMode)
	}
}
