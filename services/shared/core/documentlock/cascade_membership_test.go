package documentlock

import (
	"context"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/redisfake"
)

func TestReleaseStaleDependentJobLocksOnGroupMembershipAdded_evictsNonHolder(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	ctx := context.Background()
	jobID := "job-new-member"
	seedLock(t, rdb, testAccountID, eipmongo.CollectionAccountJobDocuments, jobID, LockRecord{
		HolderSessionID: "sess-other",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})

	ReleaseStaleDependentJobLocksOnGroupMembershipAdded(ctx, Deps{
		Redis: rdb,
	}, testAccountID, "group-x", []string{jobID}, "sess-group-holder")

	rec, err := GetLock(ctx, rdb, testAccountID, eipmongo.CollectionAccountJobDocuments, jobID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec != nil {
		t.Fatalf("expected lock cleared for non-aligned holder, got %+v", rec)
	}
}

func TestReleaseStaleDependentJobLocksOnGroupMembershipAdded_keepsAlignedHolder(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	ctx := context.Background()
	jobID := "job-aligned"
	seedLock(t, rdb, testAccountID, eipmongo.CollectionAccountJobDocuments, jobID, LockRecord{
		HolderSessionID: "sess-group-holder",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})

	ReleaseStaleDependentJobLocksOnGroupMembershipAdded(ctx, Deps{
		Redis: rdb,
	}, testAccountID, "group-x", []string{jobID}, "sess-group-holder")

	rec, err := GetLock(ctx, rdb, testAccountID, eipmongo.CollectionAccountJobDocuments, jobID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-group-holder" {
		t.Fatalf("expected lock retained for group holder, got %+v", rec)
	}
}
