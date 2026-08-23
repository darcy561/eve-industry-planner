package documentlock

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"eve-industry-planner/testing/redisfake"
)

// concurrencyTestService builds a Service with Redis only — no JetStream /
// Mongo since those are needed only for publish/cascade and the script
// transitions are pure-Redis.
//
// Returns the service, the underlying client + miniredis (so tests can fast-
// forward time / seed state), and a t.Cleanup runs everything.
func concurrencyTestService(t *testing.T) (*Service, *redis.Client, *miniredis.Miniredis) {
	t.Helper()
	f := redisfake.New(t)
	rdb, srv := f.Client, f.Server
	svc := NewService(Deps{Redis: rdb})
	return svc, rdb, srv
}

// TestAtomic_AcquireRace launches many goroutines all attempting to acquire a
// fresh lock simultaneously. The Lua script must serialise the
// read-modify-write, so exactly one caller is granted; the rest see the
// granted holder as the contended-payload holder.
func TestAtomic_AcquireRace(t *testing.T) {
	t.Parallel()
	svc, _, _ := concurrencyTestService(t)
	ctx := context.Background()

	const N = 64
	type result struct {
		status int
		holder string
	}
	results := make([]result, N)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < N; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			sess := sessionIDForIndex(i)
			out, err := svc.Acquire(ctx, testAccountID, sess, testCollection, testDocID)
			if err != nil {
				t.Errorf("Acquire[%d]: %v", i, err)
				return
			}
			results[i].status = out.StatusCode
			if h, ok := out.Payload["holderSessionID"].(string); ok {
				results[i].holder = h
			}
		}()
	}
	close(start)
	wg.Wait()

	var granted int
	var winningHolder string
	for i, r := range results {
		switch r.status {
		case http.StatusCreated:
			granted++
			winningHolder = r.holder
			if winningHolder != sessionIDForIndex(i) {
				t.Errorf("granted result[%d] reports holder=%q, want %q", i, winningHolder, sessionIDForIndex(i))
			}
		case http.StatusOK:
			// Contended — must report a non-empty holder.
			if r.holder == "" {
				t.Errorf("contended result[%d] missing holderSessionID", i)
			}
		default:
			t.Errorf("result[%d] unexpected status=%d", i, r.status)
		}
	}
	if granted != 1 {
		t.Fatalf("expected exactly one granted, got %d", granted)
	}
	// Every contended result must agree on the winning holder.
	for i, r := range results {
		if r.status == http.StatusOK && r.holder != winningHolder {
			t.Errorf("contended[%d] holder=%q diverges from winner=%q", i, r.holder, winningHolder)
		}
	}
}

// TestAtomic_ReleaseRespectsHolder asserts that a Release call from a session
// other than the current holder does not delete the lock. Two concurrent
// non-holder Releases must both no-op (regression coverage for the historic
// TOCTOU between read-holder-check and DEL).
func TestAtomic_ReleaseRespectsHolder(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	// Seed: sess-real holds the lock.
	mustAcquire(t, ctx, svc, "sess-real")

	var wg sync.WaitGroup
	for _, sess := range []string{"sess-impostor-a", "sess-impostor-b"} {
		sess := sess
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := svc.Release(ctx, testAccountID, sess, testCollection, testDocID); err != nil {
				t.Errorf("Release(%s): %v", sess, err)
			}
		}()
	}
	wg.Wait()

	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-real" {
		t.Fatalf("lock should still be held by sess-real, got %+v", rec)
	}

	if err := svc.Release(ctx, testAccountID, "sess-real", testCollection, testDocID); err != nil {
		t.Fatalf("legitimate Release: %v", err)
	}
	rec, err = GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock after legit release: %v", err)
	}
	if rec != nil {
		t.Fatalf("expected lock removed after legitimate Release, got %+v", rec)
	}
}

// TestAtomic_HandOverRace seeds a holder with multiple alive waiters and
// fires two HandOver calls in parallel. Exactly one must promote the head;
// the other has to observe the new holder (and no-op or promote the *new*
// head, never double-grant the same waiter).
func TestAtomic_HandOverRace(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	for _, w := range []string{"sess-wait-1", "sess-wait-2"} {
		mustEnqueueWithPulse(t, ctx, rdb, w)
	}

	// Both HandOvers run as "sess-holder" — only one of them can find the
	// record still owned by sess-holder; the second will see it has rotated
	// and return 409 noop. (No double-grant of sess-wait-1.)
	var promotedTo atomic.Value // string
	var noopCount int32
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := svc.HandOver(ctx, testAccountID, "sess-holder", testCollection, testDocID)
			if err != nil {
				t.Errorf("HandOver: %v", err)
				return
			}
			switch out.StatusCode {
			case http.StatusOK:
				holder, _ := out.Payload["holderSessionID"].(string)
				promotedTo.Store(holder)
			case http.StatusConflict:
				atomic.AddInt32(&noopCount, 1)
			default:
				t.Errorf("HandOver: unexpected status=%d", out.StatusCode)
			}
		}()
	}
	wg.Wait()

	promoted, _ := promotedTo.Load().(string)
	if promoted == "" {
		t.Fatalf("expected one HandOver to promote a waiter")
	}
	if promoted != "sess-wait-1" {
		t.Fatalf("expected promotion of head sess-wait-1, got %q", promoted)
	}
	if noopCount != 1 {
		t.Fatalf("expected exactly one noop sibling, got %d", noopCount)
	}

	// The remaining waiter must still be in the queue (no double-dequeue).
	n, err := WaitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("WaitlistLen: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 waiter remaining (sess-wait-2), got %d", n)
	}
	head, err := PeekWaitlistHead(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("PeekWaitlistHead: %v", err)
	}
	if head != "sess-wait-2" {
		t.Fatalf("expected head=sess-wait-2, got %q", head)
	}
}

// TestAtomic_ClaimHandoffOnlyProbeTargetWins seeds a probe targeting one
// session, then launches concurrent ClaimHandoff attempts from that session
// AND a non-target. Only the probe target may succeed (granted); the impostor
// must see "no active probe for this session".
func TestAtomic_ClaimHandoffOnlyProbeTargetWins(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	mustEnqueueWithPulse(t, ctx, rdb, "sess-target")
	mustEnqueueWithPulse(t, ctx, rdb, "sess-impostor")

	// Manually paint a probe targeting sess-target.
	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	rec.ProbeTargetSessionID = "sess-target"
	rec.ProbeExpiresAtUnix = time.Now().Unix() + ProbeAckWaitSeconds
	if err := SetLock(ctx, rdb, testAccountID, testCollection, testDocID, *rec); err != nil {
		t.Fatalf("SetLock: %v", err)
	}

	type claimRes struct {
		sess string
		out  *ClaimHandoffOutput
	}
	resCh := make(chan claimRes, 2)
	var wg sync.WaitGroup
	for _, s := range []string{"sess-target", "sess-impostor"} {
		s := s
		wg.Add(1)
		go func() {
			defer wg.Done()
			out, err := svc.ClaimHandoff(ctx, testAccountID, s, testCollection, testDocID)
			if err != nil {
				t.Errorf("ClaimHandoff(%s): %v", s, err)
				return
			}
			resCh <- claimRes{sess: s, out: out}
		}()
	}
	wg.Wait()
	close(resCh)

	results := map[string]*ClaimHandoffOutput{}
	for r := range resCh {
		results[r.sess] = r.out
	}
	target := results["sess-target"]
	impostor := results["sess-impostor"]
	if target == nil || impostor == nil {
		t.Fatalf("missing results: target=%v impostor=%v", target, impostor)
	}
	if target.Status != http.StatusOK {
		t.Errorf("expected probe target to receive 200, got %d (%s)", target.Status, target.ErrText)
	}
	if impostor.Status == http.StatusOK {
		t.Errorf("expected impostor to be rejected, got 200 with %v", impostor.Payload)
	}

	// Lock must now be held by sess-target.
	rec, err = GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock after claim: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-target" {
		t.Fatalf("expected new holder sess-target, got %+v", rec)
	}
	if rec.ProbeTargetSessionID != "" || rec.ProbeExpiresAtUnix != 0 {
		t.Fatalf("expected probe state cleared, got %+v", rec)
	}
}

// TestAtomic_RequestAccessRace covers the auto-grant code path on an empty
// lock. Two concurrent RequestAccess calls on a vacant doc — exactly one
// should be granted, the other must end up queued (not double-granted).
func TestAtomic_RequestAccessRace(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	type req struct {
		sess string
		out  *RequestLockResult
		err  error
	}
	results := make([]req, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i, s := range []string{"sess-a", "sess-b"} {
		i := i
		s := s
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			out, err := svc.RequestAccess(ctx, testAccountID, s, testCollection, testDocID)
			results[i] = req{sess: s, out: out, err: err}
		}()
	}
	close(start)
	wg.Wait()

	var grants, queues int
	var grantedSess string
	for _, r := range results {
		if r.err != nil {
			t.Fatalf("RequestAccess(%s): %v", r.sess, r.err)
		}
		switch r.out.StatusCode {
		case http.StatusCreated:
			grants++
			grantedSess = r.sess
		case http.StatusAccepted:
			queues++
		default:
			t.Errorf("RequestAccess(%s) unexpected status=%d", r.sess, r.out.StatusCode)
		}
	}
	if grants != 1 || queues != 1 {
		t.Fatalf("expected 1 grant + 1 queue, got grants=%d queues=%d", grants, queues)
	}

	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != grantedSess {
		t.Fatalf("expected lock held by %s, got %+v", grantedSess, rec)
	}
}

// TestAtomic_ExtendCycle walks the extend state machine to prove the new
// Lua-backed Extend preserves the old behaviour: 3 free renewals, then
// either cycle-reset (no waitlist) or probe-set (alive head).
func TestAtomic_ExtendCycle(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")

	// Renew up to MaxExtensionsBeforeHandoffConsult times — every one should
	// be a plain extend (no probe).
	for i := 0; i < MaxExtensionsBeforeHandoffConsult; i++ {
		out, err := svc.Extend(ctx, testAccountID, "sess-holder", testCollection, testDocID)
		if err != nil {
			t.Fatalf("Extend[%d]: %v", i, err)
		}
		if out.Extras.HandoffPending {
			t.Fatalf("Extend[%d] reported HandoffPending too early", i)
		}
		if out.ExtendCount != i+1 {
			t.Fatalf("Extend[%d] count=%d, want %d", i, out.ExtendCount, i+1)
		}
	}

	t.Run("cycle_reset_when_no_waitlist", func(t *testing.T) {
		out, err := svc.Extend(ctx, testAccountID, "sess-holder", testCollection, testDocID)
		if err != nil {
			t.Fatalf("Extend cycle reset: %v", err)
		}
		if !out.Extras.CycleReset {
			t.Fatalf("expected CycleReset=true, got %+v", out.Extras)
		}
		if out.ExtendCount != 0 {
			t.Fatalf("expected ExtendCount reset to 0, got %d", out.ExtendCount)
		}
	})

	t.Run("probe_set_when_alive_head_exists", func(t *testing.T) {
		// Bump back up to the threshold, then enqueue a live waiter and
		// trigger the consult step.
		for i := 0; i < MaxExtensionsBeforeHandoffConsult; i++ {
			if _, err := svc.Extend(ctx, testAccountID, "sess-holder", testCollection, testDocID); err != nil {
				t.Fatalf("pre-probe Extend[%d]: %v", i, err)
			}
		}
		mustEnqueueWithPulse(t, ctx, rdb, "sess-waiter")

		out, err := svc.Extend(ctx, testAccountID, "sess-holder", testCollection, testDocID)
		if err != nil {
			t.Fatalf("Extend probe-set: %v", err)
		}
		if !out.Extras.HandoffPending {
			t.Fatalf("expected HandoffPending=true on probe-set, got %+v", out.Extras)
		}
		if out.Extras.ProbeTargetSessionID != "sess-waiter" {
			t.Fatalf("expected probe target=sess-waiter, got %q", out.Extras.ProbeTargetSessionID)
		}

		rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
		if err != nil {
			t.Fatalf("GetLock: %v", err)
		}
		if rec.ProbeTargetSessionID != "sess-waiter" || rec.ProbeExpiresAtUnix == 0 {
			t.Fatalf("probe fields not persisted: %+v", rec)
		}
	})
}

// TestAtomic_HandOverFallsBackToReleaseWhenNoLiveWaiter covers the "released_no_queue"
// path: a waiter is enqueued but their pulse never set (or expired). HandOver
// must release the lock outright instead of granting to a stale entry.
func TestAtomic_HandOverFallsBackToReleaseWhenNoLiveWaiter(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	if err := EnqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "sess-stale"); err != nil {
		t.Fatalf("enqueue stale: %v", err)
	}

	out, err := svc.HandOver(ctx, testAccountID, "sess-holder", testCollection, testDocID)
	if err != nil {
		t.Fatalf("HandOver: %v", err)
	}
	if out.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 fallback release, got %d", out.StatusCode)
	}

	rec, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec != nil {
		t.Fatalf("expected lock cleared after HandOver fallback, got %+v", rec)
	}
	n, err := WaitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("WaitlistLen: %v", err)
	}
	if n != 0 {
		t.Fatalf("stale waiter must have been pruned during alive walk, got len=%d", n)
	}
}

// TestHandOverNoopWhenCallerNotRedisHolder covers POST /hand-over when the
// caller's session id does not match Redis holderSessionID: must be 409 with
// ErrCodeHandOverNoop (distinct from released_no_queue 204 for the SPA).
func TestHandOverNoopWhenCallerNotRedisHolder(t *testing.T) {
	t.Parallel()
	svc, _, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "redis-holder")
	out, err := svc.HandOver(ctx, testAccountID, "wrong-jwt-session", testCollection, testDocID)
	if err != nil {
		t.Fatalf("HandOver: %v", err)
	}
	if out.StatusCode != http.StatusConflict {
		t.Fatalf("status=%d want 409 Conflict", out.StatusCode)
	}
	if out.Payload == nil || out.Payload["error"] != ErrCodeHandOverNoop {
		t.Fatalf("payload=%v want error=%q", out.Payload, ErrCodeHandOverNoop)
	}
}

// --- helpers ---------------------------------------------------------------

func sessionIDForIndex(i int) string {
	const alpha = "0123456789abcdefghijklmnopqrstuvwxyz"
	if i < len(alpha) {
		return "sess-" + string(alpha[i])
	}
	return "sess-" + alpha[:1] + alpha[i%len(alpha):i%len(alpha)+1]
}

func mustAcquire(t *testing.T, ctx context.Context, svc *Service, sessionID string) {
	t.Helper()
	out, err := svc.Acquire(ctx, testAccountID, sessionID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("seed Acquire(%s): %v", sessionID, err)
	}
	if out.StatusCode != http.StatusCreated {
		t.Fatalf("seed Acquire(%s) status=%d, want 201", sessionID, out.StatusCode)
	}
}

func mustEnqueueWithPulse(t *testing.T, ctx context.Context, rdb *redis.Client, sessionID string) {
	t.Helper()
	if err := EnqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, sessionID); err != nil {
		t.Fatalf("EnqueueWaitlistUnique(%s): %v", sessionID, err)
	}
	if err := TouchWaitlistPulse(ctx, rdb, testAccountID, testCollection, testDocID, sessionID); err != nil {
		t.Fatalf("TouchWaitlistPulse(%s): %v", sessionID, err)
	}
}

func TestForceReleaseSameAccount(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()
	now := time.Now().Unix()
	rec := LockRecord{
		HolderSessionID: "holder-sess",
		AccountID:       testAccountID,
		ExpiresAtUnix:   now + 300,
	}
	if err := SetLock(ctx, rdb, testAccountID, testCollection, testDocID, rec); err != nil {
		t.Fatal(err)
	}
	if err := EnqueueWaitlistUnique(ctx, rdb, testAccountID, testCollection, testDocID, "waiter"); err != nil {
		t.Fatal(err)
	}

	out, err := svc.ForceReleaseSameAccount(ctx, testAccountID, "other-sess", testCollection, testDocID)
	if err != nil {
		t.Fatalf("ForceReleaseSameAccount: %v", err)
	}
	if out == nil || out.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 granted, got %+v", out)
	}
	if holder, _ := out.Payload["holderSessionID"].(string); holder != "other-sess" {
		t.Fatalf("expected holder other-sess, got %q", holder)
	}
	got, err := GetLock(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.HolderSessionID != "other-sess" {
		t.Fatalf("expected lock granted to other-sess, got %+v", got)
	}
	n, err := WaitlistLen(ctx, rdb, testAccountID, testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("waitlist not cleared, len=%d", n)
	}

	if err := SetLock(ctx, rdb, testAccountID, testCollection, testDocID, LockRecord{
		HolderSessionID: "holder2",
		AccountID:       testAccountID,
		ExpiresAtUnix:   now + 300,
	}); err != nil {
		t.Fatal(err)
	}
	_, err = svc.ForceReleaseSameAccount(ctx, testAccountID, "holder2", testCollection, testDocID)
	if !errors.Is(err, ErrForceReleaseSameSession) {
		t.Fatalf("want ErrForceReleaseSameSession, got %v", err)
	}

	_ = DeleteLock(ctx, rdb, testAccountID, testCollection, testDocID)
	_, err = svc.ForceReleaseSameAccount(ctx, testAccountID, "x", testCollection, testDocID)
	if !errors.Is(err, ErrForceReleaseNoLock) {
		t.Fatalf("want ErrForceReleaseNoLock, got %v", err)
	}
}
