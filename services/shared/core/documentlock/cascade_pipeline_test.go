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

func TestPipelinedDecideAndReleaseJobLocks_NoLocksReturnsNoReleases(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)

	releases, err := pipelinedDecideAndReleaseJobLocks(
		context.Background(),
		rdb,
		testOwner,
		[]string{"job-a", "job-b"},
		func(*LockRecord) (bool, string) { return true, "anyone" },
	)
	if err != nil {
		t.Fatalf("pipelinedDecideAndReleaseJobLocks: %v", err)
	}
	if len(releases) != 0 {
		t.Fatalf("expected 0 releases, got %d", len(releases))
	}
}

func TestPipelinedDecideAndReleaseJobLocks_PartialReleaseDelsOnlyChosen(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()

	heldBy := func(id string) LockRecord {
		return LockRecord{
			HolderSessionID: id,
			AccountID:       testAccountID,
			ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
		}
	}

	jobIDs := []string{"job-a", "job-b", "job-c", "job-d", "job-e"}
	holders := map[string]string{
		"job-a": "sess-old",
		"job-b": "sess-new",
		"job-c": "sess-old",
		"job-d": "sess-other",
		"job-e": "sess-old",
	}
	for _, jobID := range jobIDs {
		seedLock(t, rdb, testOwner, eipmongo.CollectionJobDocuments, jobID, heldBy(holders[jobID]))
	}

	releases, err := pipelinedDecideAndReleaseJobLocks(
		ctx,
		rdb,
		testOwner,
		jobIDs,
		func(rec *LockRecord) (bool, string) {
			if rec == nil || rec.HolderSessionID != "sess-old" {
				return false, ""
			}
			return true, rec.HolderSessionID
		},
	)
	if err != nil {
		t.Fatalf("pipelinedDecideAndReleaseJobLocks: %v", err)
	}
	if len(releases) != 3 {
		t.Fatalf("expected 3 releases, got %d (%v)", len(releases), releases)
	}

	wantReleased := map[string]bool{"job-a": true, "job-c": true, "job-e": true}
	for _, r := range releases {
		if !wantReleased[r.JobID] {
			t.Fatalf("unexpected job released: %v", r)
		}
		if r.EvictedSessionID != "sess-old" {
			t.Fatalf("evictedSessionID: got %q, want sess-old", r.EvictedSessionID)
		}
	}

	for jobID, ownedBy := range holders {
		key := LockKey(testOwner, eipmongo.CollectionJobDocuments, jobID)
		exists, err := rdb.Exists(ctx, key)
		if err != nil {
			t.Fatalf("Exists: %v", err)
		}
		if ownedBy == "sess-old" {
			if exists {
				t.Fatalf("expected %q to be released (held by sess-old)", jobID)
			}
		} else if !exists {
			t.Fatalf("expected %q to remain (held by %q)", jobID, ownedBy)
		}
	}
}

func TestPipelinedDecideAndReleaseJobLocks_ExpiredRecordsBypassPredicate(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()

	jobID := "job-expired"
	rec := LockRecord{
		HolderSessionID: "sess-old",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(-time.Minute).Unix(),
	}
	b, _ := json.Marshal(rec)
	if err := rdb.Driver().Set(ctx, LockKey(testOwner, eipmongo.CollectionJobDocuments, jobID), b, 0).Err(); err != nil {
		t.Fatalf("seed expired: %v", err)
	}

	called := 0
	releases, err := pipelinedDecideAndReleaseJobLocks(
		ctx,
		rdb,
		testOwner,
		[]string{jobID},
		func(*LockRecord) (bool, string) {
			called++
			return true, "anyone"
		},
	)
	if err != nil {
		t.Fatalf("pipelinedDecideAndReleaseJobLocks: %v", err)
	}
	if called != 0 {
		t.Fatalf("predicate must not be called for expired records; called %d times", called)
	}
	if len(releases) != 0 {
		t.Fatalf("expected 0 releases for expired record, got %d", len(releases))
	}
}

func TestPipelinedDecideAndReleaseJobLocks_BlankIDsSkipped(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)
	ctx := context.Background()

	seedLock(t, rdb, testOwner, eipmongo.CollectionJobDocuments, "job-real", LockRecord{
		HolderSessionID: "sess-real",
		AccountID:       testAccountID,
		ExpiresAtUnix:   time.Now().Add(time.Minute).Unix(),
	})

	calls := 0
	releases, err := pipelinedDecideAndReleaseJobLocks(
		ctx,
		rdb,
		testOwner,
		[]string{"", "job-real", ""},
		func(*LockRecord) (bool, string) {
			calls++
			return true, "evicted"
		},
	)
	if err != nil {
		t.Fatalf("pipelinedDecideAndReleaseJobLocks: %v", err)
	}
	if calls != 1 {
		t.Fatalf("predicate called %d times, want 1", calls)
	}
	if len(releases) != 1 || releases[0].JobID != "job-real" {
		t.Fatalf("unexpected releases: %v", releases)
	}
}

func TestPipelinedDecideAndReleaseJobLocks_NilRedisAndPredicateGuards(t *testing.T) {
	t.Parallel()
	rdb := eipredis.NewRedis(redisfake.New(t).Client)

	if r, err := pipelinedDecideAndReleaseJobLocks(context.Background(), nil, testOwner, []string{"x"}, func(*LockRecord) (bool, string) { return true, "" }); err != nil || r != nil {
		t.Fatalf("nil rdb: expected (nil, nil), got (%v, %v)", r, err)
	}
	if r, err := pipelinedDecideAndReleaseJobLocks(context.Background(), rdb, testOwner, []string{"x"}, nil); err != nil || r != nil {
		t.Fatalf("nil decide: expected (nil, nil), got (%v, %v)", r, err)
	}
	if r, err := pipelinedDecideAndReleaseJobLocks(context.Background(), rdb, testOwner, nil, func(*LockRecord) (bool, string) { return true, "" }); err != nil || r != nil {
		t.Fatalf("nil ids: expected (nil, nil), got (%v, %v)", r, err)
	}
}
