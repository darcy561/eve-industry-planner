package documentlocks

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// newTestRedis spins up an in-memory miniredis and a real go-redis client
// pointed at it. Returned cleanup teardown is registered via t.Cleanup so
// callers don't have to remember to close the client.
func newTestRedis(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	srv, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	t.Cleanup(func() { srv.Close() })
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, srv
}

const (
	testAccountID  = "acct-1"
	testCollection = "user_job_documents"
	testDocID      = "doc-1"
)

// TestParseExpiredLockKey covers the round-trip from an in-memory v2 key back
// to its (accountID, collection, docID) tuple, plus the v1 / mangled key
// rejection paths.
func TestParseExpiredLockKey(t *testing.T) {
	t.Parallel()

	t.Run("v2_key_parses", func(t *testing.T) {
		key := LockKeyV2(testAccountID, testCollection, testDocID)
		acct, coll, doc, ok := ParseExpiredLockKey(key)
		if !ok {
			t.Fatalf("expected ok=true")
		}
		if acct != testAccountID || coll != testCollection || doc != testDocID {
			t.Fatalf("expected (%q,%q,%q), got (%q,%q,%q)",
				testAccountID, testCollection, testDocID, acct, coll, doc)
		}
	})

	t.Run("v1_key_rejected", func(t *testing.T) {
		key := lockKeyV1(testCollection, testDocID)
		_, _, _, ok := ParseExpiredLockKey(key)
		if ok {
			t.Fatalf("expected ok=false for v1 key")
		}
	})

	t.Run("garbage_key_rejected", func(t *testing.T) {
		_, _, _, ok := ParseExpiredLockKey("not_a_lock_key")
		if ok {
			t.Fatalf("expected ok=false for unrelated key")
		}
	})
}

// TestSetAndGetLockRoundtrip pins the JSON round-trip through setLock/getLock
// and confirms TTL-expired records are surfaced as a nil read.
func TestSetAndGetLockRoundtrip(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	now := time.Now().Unix()
	rec := lockRecord{
		HolderSessionID: "sess-a",
		AccountID:       testAccountID,
		ExpiresAtUnix:   now + 300,
		ExtendCount:     2,
	}
	if err := setLock(ctx, rdb, testAccountID, testCollection, testDocID, rec); err != nil {
		t.Fatalf("setLock: %v", err)
	}
	got, err := getLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("getLock: %v", err)
	}
	if got == nil {
		t.Fatalf("expected record, got nil")
	}
	if got.HolderSessionID != "sess-a" || got.ExtendCount != 2 {
		t.Fatalf("unexpected record: %+v", got)
	}

	t.Run("expired_record_returns_nil", func(t *testing.T) {
		expired := lockRecord{
			HolderSessionID: "sess-b",
			AccountID:       testAccountID,
			ExpiresAtUnix:   now - 5,
		}
		if err := setLock(ctx, rdb, testAccountID, testCollection, "doc-expired", expired); err != nil {
			t.Fatalf("setLock: %v", err)
		}
		got, err := getLock(ctx, rdb, testAccountID, testCollection, "doc-expired")
		if err != nil {
			t.Fatalf("getLock: %v", err)
		}
		if got != nil {
			t.Fatalf("expected nil for expired record, got %+v", got)
		}
	})

	t.Run("delete_clears_lock", func(t *testing.T) {
		if err := deleteLock(ctx, rdb, testAccountID, testCollection, testDocID); err != nil {
			t.Fatalf("deleteLock: %v", err)
		}
		got, err := getLock(ctx, rdb, testAccountID, testCollection, testDocID)
		if err != nil {
			t.Fatalf("getLock: %v", err)
		}
		if got != nil {
			t.Fatalf("expected nil after delete, got %+v", got)
		}
	})
}

// TestEnqueueWaitlistUniqueAndPeek confirms re-enqueuing the same session is
// idempotent (LRem-then-RPush keeps a single entry, repositioned to tail).
func TestEnqueueWaitlistUniqueAndPeek(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a"); err != nil {
		t.Fatalf("enqueue sess-a: %v", err)
	}
	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-b"); err != nil {
		t.Fatalf("enqueue sess-b: %v", err)
	}
	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a"); err != nil {
		t.Fatalf("re-enqueue sess-a: %v", err)
	}

	n, err := waitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("waitlistLen: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 entries, got %d", n)
	}

	head, err := peekWaitlistHead(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("peekWaitlistHead: %v", err)
	}
	if head != "sess-b" {
		t.Fatalf("expected head=sess-b (re-enqueue moves sess-a to tail), got %q", head)
	}
}

// TestPeekWaitlistHeadAlive_PrunesStale ensures the alive-aware peek drops
// stale heads (no pulse) and surfaces the first session whose pulse is still
// present.
func TestPeekWaitlistHeadAlive_PrunesStale(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	// Enqueue three sessions, only the last has an active pulse.
	for _, s := range []string{"sess-stale-1", "sess-stale-2", "sess-alive"} {
		if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, s); err != nil {
			t.Fatalf("enqueue %s: %v", s, err)
		}
	}
	if err := touchWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, "sess-alive"); err != nil {
		t.Fatalf("touchWaitlistPulse: %v", err)
	}

	head, err := peekWaitlistHeadAlive(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("peekWaitlistHeadAlive: %v", err)
	}
	if head != "sess-alive" {
		t.Fatalf("expected head=sess-alive, got %q", head)
	}

	// Stale entries should be removed by the alive sweep.
	n, err := waitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("waitlistLen: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 entry left after pruning, got %d", n)
	}
}

// TestPeekWaitlistHeadAlive_EmptyAfterPruning verifies the function returns
// "" (rather than an error) when every queued entry is stale.
func TestPeekWaitlistHeadAlive_EmptyAfterPruning(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	for _, s := range []string{"sess-x", "sess-y"} {
		if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, s); err != nil {
			t.Fatalf("enqueue %s: %v", s, err)
		}
	}

	head, err := peekWaitlistHeadAlive(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("peekWaitlistHeadAlive: %v", err)
	}
	if head != "" {
		t.Fatalf("expected empty head, got %q", head)
	}

	n, err := waitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("waitlistLen: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected empty waitlist after exhaustive pruning, got %d", n)
	}
}

// TestPromoteWaitlistHead_Success confirms the happy-path transfer:
// alive head becomes the new holder, lock points at them with a fresh expiry,
// and the head has been dequeued.
func TestPromoteWaitlistHead_Success(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	// Seed an existing holder, then push two requesters with pulses.
	now := time.Now().Unix()
	seed := lockRecord{HolderSessionID: "sess-old", AccountID: testAccountID, ExpiresAtUnix: now + 300}
	if err := setLock(ctx, rdb, testAccountID, testCollection, testDocID, seed); err != nil {
		t.Fatalf("setLock seed: %v", err)
	}
	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-next"); err != nil {
		t.Fatalf("enqueue sess-next: %v", err)
	}
	if err := touchWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, "sess-next"); err != nil {
		t.Fatalf("touchWaitlistPulse: %v", err)
	}
	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-after"); err != nil {
		t.Fatalf("enqueue sess-after: %v", err)
	}
	if err := touchWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, "sess-after"); err != nil {
		t.Fatalf("touchWaitlistPulse sess-after: %v", err)
	}

	head, rec, promoted, err := promoteWaitlistHead(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("promoteWaitlistHead: %v", err)
	}
	if !promoted {
		t.Fatalf("expected promoted=true")
	}
	if head != "sess-next" {
		t.Fatalf("expected head=sess-next, got %q", head)
	}
	if rec == nil || rec.HolderSessionID != "sess-next" {
		t.Fatalf("expected rec.HolderSessionID=sess-next, got %+v", rec)
	}
	if rec.ExtendCount != 0 || rec.ProbeTargetSessionID != "" {
		t.Fatalf("expected cleared extend/probe state, got %+v", rec)
	}

	stored, err := getLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("getLock: %v", err)
	}
	if stored == nil || stored.HolderSessionID != "sess-next" {
		t.Fatalf("expected lock now held by sess-next, got %+v", stored)
	}

	// Head dequeued.
	n, err := waitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("waitlistLen: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 remaining waitlist entry, got %d", n)
	}
	remaining, err := peekWaitlistHead(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("peekWaitlistHead: %v", err)
	}
	if remaining != "sess-after" {
		t.Fatalf("expected remaining=sess-after, got %q", remaining)
	}
}

// TestPromoteWaitlistHead_NoAliveHead returns (false, no error) when the
// waitlist is empty or every entry is stale, so the caller can fall back to a
// plain release / `document_lock_expired` publish.
func TestPromoteWaitlistHead_NoAliveHead(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	t.Run("empty_waitlist", func(t *testing.T) {
		head, rec, promoted, err := promoteWaitlistHead(ctx, rdb, testAccountID, testCollection, "empty")
		if err != nil {
			t.Fatalf("promoteWaitlistHead: %v", err)
		}
		if promoted || head != "" || rec != nil {
			t.Fatalf("expected (\"\", nil, false), got (%q, %+v, %v)", head, rec, promoted)
		}
	})

	t.Run("stale_only", func(t *testing.T) {
		const doc = "stale-only"
		if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, doc, "sess-stale"); err != nil {
			t.Fatalf("enqueue: %v", err)
		}
		head, rec, promoted, err := promoteWaitlistHead(ctx, rdb, testAccountID, testCollection, doc)
		if err != nil {
			t.Fatalf("promoteWaitlistHead: %v", err)
		}
		if promoted || head != "" || rec != nil {
			t.Fatalf("expected (\"\", nil, false), got (%q, %+v, %v)", head, rec, promoted)
		}
	})

	t.Run("nil_redis_returns_nothing", func(t *testing.T) {
		head, rec, promoted, err := promoteWaitlistHead(ctx, nil, testAccountID, testCollection, testDocID)
		if err != nil {
			t.Fatalf("expected no error with nil redis, got %v", err)
		}
		if promoted || head != "" || rec != nil {
			t.Fatalf("expected (\"\", nil, false), got (%q, %+v, %v)", head, rec, promoted)
		}
	})
}

// TestLockHeldByOther covers the predicate used by mutation handlers that
// want to detect contention without fully transferring ownership.
func TestLockHeldByOther(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	now := time.Now().Unix()
	if err := setLock(ctx, rdb, testAccountID, testCollection, testDocID, lockRecord{
		HolderSessionID: "sess-holder",
		AccountID:       testAccountID,
		ExpiresAtUnix:   now + 300,
	}); err != nil {
		t.Fatalf("setLock: %v", err)
	}

	t.Run("holder_session_not_blocked", func(t *testing.T) {
		blocked, err := LockHeldByOther(ctx, rdb, testAccountID, testCollection, testDocID, "sess-holder")
		if err != nil {
			t.Fatalf("LockHeldByOther: %v", err)
		}
		if blocked {
			t.Fatalf("expected blocked=false for holder")
		}
	})

	t.Run("other_session_blocked", func(t *testing.T) {
		blocked, err := LockHeldByOther(ctx, rdb, testAccountID, testCollection, testDocID, "sess-other")
		if err != nil {
			t.Fatalf("LockHeldByOther: %v", err)
		}
		if !blocked {
			t.Fatalf("expected blocked=true for other session")
		}
	})

	t.Run("empty_requester_treated_as_blocking", func(t *testing.T) {
		blocked, err := LockHeldByOther(ctx, rdb, testAccountID, testCollection, testDocID, "")
		if err != nil {
			t.Fatalf("LockHeldByOther: %v", err)
		}
		if !blocked {
			t.Fatalf("expected blocked=true for empty requester")
		}
	})

	t.Run("unheld_doc_not_blocked", func(t *testing.T) {
		blocked, err := LockHeldByOther(ctx, rdb, testAccountID, testCollection, "doc-free", "sess-other")
		if err != nil {
			t.Fatalf("LockHeldByOther: %v", err)
		}
		if blocked {
			t.Fatalf("expected blocked=false for unheld doc")
		}
	})
}

// TestHasWaitlistPulseAndRemoveFromWaitlist exercise the small key-management
// helpers that sit alongside the higher-level waitlist functions.
func TestHasWaitlistPulseAndRemoveFromWaitlist(t *testing.T) {
	t.Parallel()
	rdb, _ := newTestRedis(t)
	ctx := context.Background()

	if err := enqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a"); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if err := touchWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a"); err != nil {
		t.Fatalf("touchWaitlistPulse: %v", err)
	}

	ok, err := hasWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a")
	if err != nil {
		t.Fatalf("hasWaitlistPulse: %v", err)
	}
	if !ok {
		t.Fatalf("expected pulse for sess-a to be present")
	}

	if err := removeFromWaitlist(ctx, rdb, testAccountID, testCollection, testDocID, "sess-a"); err != nil {
		t.Fatalf("removeFromWaitlist: %v", err)
	}
	n, err := waitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("waitlistLen: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected empty waitlist after remove, got %d", n)
	}
}
