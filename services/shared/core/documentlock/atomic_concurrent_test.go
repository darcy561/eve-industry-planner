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

	"eve-industry-planner/testing/redisfake"

	eipredis "eve-industry-planner/shared/redis"
)

func concurrencyTestService(t *testing.T) (*Service, *eipredis.Redis, *miniredis.Miniredis) {
	t.Helper()
	f := redisfake.New(t)
	rdb := eipredis.NewRedis(f.Client)
	svc := NewService(Deps{Redis: rdb})
	return svc, rdb, f.Server
}

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
	for i := range N {
		wg.Go(func() {
			<-start
			sess := sessionIDForIndex(i)
			out, err := svc.Acquire(ctx, testOwner, testAccountID, sess, testCollection, testDocID)
			if err != nil {
				t.Errorf("Acquire[%d]: %v", i, err)
				return
			}
			results[i].status = out.StatusCode
			if h, ok := out.Payload["holderParticipantID"].(string); ok {
				results[i].holder = h
			}
		})
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
			if winningHolder != ParticipantID(sessionIDForIndex(i)) {
				t.Errorf("granted result[%d] reports holder=%q, want %q", i, winningHolder, ParticipantID(sessionIDForIndex(i)))
			}
		case http.StatusOK:
			if r.holder == "" {
				t.Errorf("contended result[%d] missing holderParticipantID", i)
			}
		default:
			t.Errorf("result[%d] unexpected status=%d", i, r.status)
		}
	}
	if granted != 1 {
		t.Fatalf("expected exactly one granted, got %d", granted)
	}
	for i, r := range results {
		if r.status == http.StatusOK && r.holder != winningHolder {
			t.Errorf("contended[%d] holder=%q diverges from winner=%q", i, r.holder, winningHolder)
		}
	}
}

func TestAtomic_ReleaseRespectsHolder(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-real")

	var wg sync.WaitGroup
	for _, sess := range []string{"sess-impostor-a", "sess-impostor-b"} {
		wg.Go(func() {
			if err := svc.Release(ctx, testOwner, sess, testCollection, testDocID); err != nil {
				t.Errorf("Release(%s): %v", sess, err)
			}
		})
	}
	wg.Wait()

	rec, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != "sess-real" {
		t.Fatalf("lock should still be held by sess-real, got %+v", rec)
	}

	if err := svc.Release(ctx, testOwner, "sess-real", testCollection, testDocID); err != nil {
		t.Fatalf("legitimate Release: %v", err)
	}
	rec, err = GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock after legit release: %v", err)
	}
	if rec != nil {
		t.Fatalf("expected lock removed after legitimate Release, got %+v", rec)
	}
}

func TestAtomic_HandOverRace(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	for _, w := range []string{"sess-wait-1", "sess-wait-2"} {
		mustEnqueueWithPulse(t, ctx, rdb, w)
	}

	var promotedTo atomic.Value
	var noopCount int32
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			out, err := svc.HandOver(ctx, testOwner, "sess-holder", testCollection, testDocID)
			if err != nil {
				t.Errorf("HandOver: %v", err)
				return
			}
			switch out.StatusCode {
			case http.StatusOK:
				holder, _ := out.Payload["holderParticipantID"].(string)
				promotedTo.Store(holder)
			case http.StatusConflict:
				atomic.AddInt32(&noopCount, 1)
			default:
				t.Errorf("HandOver: unexpected status=%d", out.StatusCode)
			}
		})
	}
	wg.Wait()

	promoted, _ := promotedTo.Load().(string)
	if promoted == "" {
		t.Fatalf("expected one HandOver to promote a waiter")
	}
	if promoted != ParticipantID("sess-wait-1") {
		t.Fatalf("expected promotion of head sess-wait-1, got %q", promoted)
	}
	if noopCount != 1 {
		t.Fatalf("expected exactly one noop sibling, got %d", noopCount)
	}

	n, err := WaitlistLen(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("WaitlistLen: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 waiter remaining (sess-wait-2), got %d", n)
	}
	head, err := PeekWaitlistHead(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("PeekWaitlistHead: %v", err)
	}
	if head != "sess-wait-2" {
		t.Fatalf("expected head=sess-wait-2, got %q", head)
	}
}

func TestAtomic_ClaimHandoffOnlyProbeTargetWins(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	mustEnqueueWithPulse(t, ctx, rdb, "sess-target")
	mustEnqueueWithPulse(t, ctx, rdb, "sess-impostor")

	rec, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	rec.ProbeTargetSessionID = "sess-target"
	rec.ProbeExpiresAtUnix = time.Now().Unix() + ProbeAckWaitSeconds
	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, *rec); err != nil {
		t.Fatalf("SetLock: %v", err)
	}

	type claimRes struct {
		sess string
		out  *ClaimHandoffOutput
	}
	resCh := make(chan claimRes, 2)
	var wg sync.WaitGroup
	for _, s := range []string{"sess-target", "sess-impostor"} {
		wg.Go(func() {
			out, err := svc.ClaimHandoff(ctx, testOwner, testAccountID, s, testCollection, testDocID)
			if err != nil {
				t.Errorf("ClaimHandoff(%s): %v", s, err)
				return
			}
			resCh <- claimRes{sess: s, out: out}
		})
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

	rec, err = GetLock(ctx, rdb, testOwner, testCollection, testDocID)
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
		wg.Go(func() {
			<-start
			out, err := svc.RequestAccess(ctx, testOwner, testAccountID, s, testCollection, testDocID)
			results[i] = req{sess: s, out: out, err: err}
		})
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

	rec, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec == nil || rec.HolderSessionID != grantedSess {
		t.Fatalf("expected lock held by %s, got %+v", grantedSess, rec)
	}
}

func TestAtomic_ExtendCycle(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")

	for i := range MaxExtensionsBeforeHandoffConsult {
		out, err := svc.Extend(ctx, testOwner, "sess-holder", testCollection, testDocID)
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
		out, err := svc.Extend(ctx, testOwner, "sess-holder", testCollection, testDocID)
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
		for i := range MaxExtensionsBeforeHandoffConsult {
			if _, err := svc.Extend(ctx, testOwner, "sess-holder", testCollection, testDocID); err != nil {
				t.Fatalf("pre-probe Extend[%d]: %v", i, err)
			}
		}
		mustEnqueueWithPulse(t, ctx, rdb, "sess-waiter")

		out, err := svc.Extend(ctx, testOwner, "sess-holder", testCollection, testDocID)
		if err != nil {
			t.Fatalf("Extend probe-set: %v", err)
		}
		if !out.Extras.HandoffPending {
			t.Fatalf("expected HandoffPending=true on probe-set, got %+v", out.Extras)
		}
		if out.Extras.ProbeTargetSessionID != "sess-waiter" {
			t.Fatalf("expected probe target=sess-waiter, got %q", out.Extras.ProbeTargetSessionID)
		}

		rec, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
		if err != nil {
			t.Fatalf("GetLock: %v", err)
		}
		if rec.ProbeTargetSessionID != "sess-waiter" || rec.ProbeExpiresAtUnix == 0 {
			t.Fatalf("probe fields not persisted: %+v", rec)
		}
	})
}

func TestAtomic_HandOverFallsBackToReleaseWhenNoLiveWaiter(t *testing.T) {
	t.Parallel()
	svc, rdb, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "sess-holder")
	if err := EnqueueWaitlistUnique(ctx, rdb, testOwner, testCollection, testDocID, "sess-stale", testAccountID); err != nil {
		t.Fatalf("enqueue stale: %v", err)
	}

	out, err := svc.HandOver(ctx, testOwner, "sess-holder", testCollection, testDocID)
	if err != nil {
		t.Fatalf("HandOver: %v", err)
	}
	if out.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 fallback release, got %d", out.StatusCode)
	}

	rec, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("GetLock: %v", err)
	}
	if rec != nil {
		t.Fatalf("expected lock cleared after HandOver fallback, got %+v", rec)
	}
	n, err := WaitlistLen(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatalf("WaitlistLen: %v", err)
	}
	if n != 0 {
		t.Fatalf("stale waiter must have been pruned during alive walk, got len=%d", n)
	}
}

func TestHandOverNoopWhenCallerNotRedisHolder(t *testing.T) {
	t.Parallel()
	svc, _, _ := concurrencyTestService(t)
	ctx := context.Background()

	mustAcquire(t, ctx, svc, "redis-holder")
	out, err := svc.HandOver(ctx, testOwner, "wrong-jwt-session", testCollection, testDocID)
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

func sessionIDForIndex(i int) string {
	const alpha = "0123456789abcdefghijklmnopqrstuvwxyz"
	if i < len(alpha) {
		return "sess-" + string(alpha[i])
	}
	return "sess-" + alpha[:1] + alpha[i%len(alpha):i%len(alpha)+1]
}

func mustAcquire(t *testing.T, ctx context.Context, svc *Service, sessionID string) {
	t.Helper()
	out, err := svc.Acquire(ctx, testOwner, testAccountID, sessionID, testCollection, testDocID)
	if err != nil {
		t.Fatalf("seed Acquire(%s): %v", sessionID, err)
	}
	if out.StatusCode != http.StatusCreated {
		t.Fatalf("seed Acquire(%s) status=%d, want 201", sessionID, out.StatusCode)
	}
}

func mustEnqueueWithPulse(t *testing.T, ctx context.Context, rdb *eipredis.Redis, sessionID string) {
	t.Helper()
	if err := EnqueueWaitlistUnique(ctx, rdb, testOwner, testCollection, testDocID, sessionID, testAccountID); err != nil {
		t.Fatalf("EnqueueWaitlistUnique(%s): %v", sessionID, err)
	}
	if err := TouchWaitlistPulse(ctx, rdb, testOwner, testCollection, testDocID, sessionID); err != nil {
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
	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, rec); err != nil {
		t.Fatal(err)
	}
	if err := EnqueueWaitlistUnique(ctx, rdb, testOwner, testCollection, testDocID, "waiter", testAccountID); err != nil {
		t.Fatal(err)
	}

	out, err := svc.ForceReleaseSameAccount(ctx, testOwner, testAccountID, "other-sess", testCollection, testDocID)
	if err != nil {
		t.Fatalf("ForceReleaseSameAccount: %v", err)
	}
	if out == nil || out.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 granted, got %+v", out)
	}
	if holder, _ := out.Payload["holderParticipantID"].(string); holder != ParticipantID("other-sess") {
		t.Fatalf("expected holder other-sess, got %q", holder)
	}
	got, err := GetLock(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.HolderSessionID != "other-sess" {
		t.Fatalf("expected lock granted to other-sess, got %+v", got)
	}
	n, err := WaitlistLen(ctx, rdb, testOwner, testCollection, testDocID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("waitlist not cleared, len=%d", n)
	}

	if err := SetLock(ctx, rdb, testOwner, testCollection, testDocID, LockRecord{
		HolderSessionID: "holder2",
		AccountID:       testAccountID,
		ExpiresAtUnix:   now + 300,
	}); err != nil {
		t.Fatal(err)
	}
	_, err = svc.ForceReleaseSameAccount(ctx, testOwner, testAccountID, "holder2", testCollection, testDocID)
	if !errors.Is(err, ErrForceReleaseSameSession) {
		t.Fatalf("want ErrForceReleaseSameSession, got %v", err)
	}

	_ = DeleteLock(ctx, rdb, testOwner, testCollection, testDocID)
	_, err = svc.ForceReleaseSameAccount(ctx, testOwner, testAccountID, "x", testCollection, testDocID)
	if !errors.Is(err, ErrForceReleaseNoLock) {
		t.Fatalf("want ErrForceReleaseNoLock, got %v", err)
	}
}
