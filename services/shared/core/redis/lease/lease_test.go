package lease

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"
)

// silentLogger drops all output so tests don't spam stderr during the
// intentional failure paths (renew failures, lost lease, etc).
type silentLogger struct{}

func (silentLogger) Debugf(context.Context, string, ...any) {}
func (silentLogger) Warnf(context.Context, string, ...any)  {}

func fastOpts() Options {
	return Options{
		TTL:            300 * time.Millisecond,
		RenewInterval:  60 * time.Millisecond,
		AcquireBackoff: 60 * time.Millisecond,
		Logger:         silentLogger{},
	}
}

// TestRunWhileHeld_SingleLeader spawns N goroutines all calling
// RunWhileHeld on the same key. Exactly one should have its fn invoked at
// any moment; the rest must be parked in the acquire loop.
func TestRunWhileHeld_SingleLeader(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	const N = 5
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var (
		mu          sync.Mutex
		concurrent  int
		maxObserved int
		invocations atomic.Int32
		leaderID    atomic.Value // string
		wg          sync.WaitGroup
	)

	for i := range N {
		wg.Go(func() {
			id := "replica-" + string(rune('a'+i)) + "-" + InstanceID()
			_ = RunWhileHeld(ctx, rdb, "lease-single", id, fastOpts(), func(scoped context.Context) error {
				invocations.Add(1)
				leaderID.Store(id)
				mu.Lock()
				concurrent++
				if concurrent > maxObserved {
					maxObserved = concurrent
				}
				mu.Unlock()
				defer func() {
					mu.Lock()
					concurrent--
					mu.Unlock()
				}()
				<-scoped.Done()
				return nil
			})
		})
	}

	// Give the cluster time to settle and confirm exactly one leader.
	time.Sleep(400 * time.Millisecond)
	mu.Lock()
	if concurrent != 1 {
		t.Fatalf("expected exactly one active leader, observed %d", concurrent)
	}
	if maxObserved > 1 {
		t.Fatalf("two replicas held the lease concurrently (max=%d)", maxObserved)
	}
	mu.Unlock()

	cancel()
	wg.Wait()

	if invocations.Load() < 1 {
		t.Fatalf("expected at least one invocation, got %d", invocations.Load())
	}
}

// TestRunWhileHeld_TakeoverAfterLeaderDies asserts that when the leader's
// scoped context is cancelled (simulating a replica restart), a parked
// replica picks up the lease after the TTL lapses.
func TestRunWhileHeld_TakeoverAfterLeaderDies(t *testing.T) {
	t.Parallel()
	f := redisfake.New(t)
	rdb, mr := f.Client, f.Server

	leaderACtx, cancelA := context.WithCancel(context.Background())
	defer cancelA()
	leaderBCtx, cancelB := context.WithCancel(context.Background())
	defer cancelB()

	var aHeld, bHeld atomic.Bool

	go func() {
		_ = RunWhileHeld(leaderACtx, rdb, "lease-takeover", "id-a-"+InstanceID(), fastOpts(), func(scoped context.Context) error {
			aHeld.Store(true)
			defer aHeld.Store(false)
			<-scoped.Done()
			return nil
		})
	}()

	// Wait for A to become leader.
	wait.For(t, 1*time.Second, func() (bool, string) {
		return aHeld.Load(), "replica A never acquired the lease"
	})

	// Start B; it should be parked.
	go func() {
		_ = RunWhileHeld(leaderBCtx, rdb, "lease-takeover", "id-b-"+InstanceID(), fastOpts(), func(scoped context.Context) error {
			bHeld.Store(true)
			defer bHeld.Store(false)
			<-scoped.Done()
			return nil
		})
	}()
	time.Sleep(150 * time.Millisecond)
	if bHeld.Load() {
		t.Fatalf("replica B held the lease while A was still leader")
	}

	// Kill A. B should take over after the lease TTL lapses on miniredis's
	// fake clock.
	cancelA()
	wait.For(t, 1*time.Second, func() (bool, string) {
		return !aHeld.Load(), "replica A never released the lease after cancel"
	})
	mr.FastForward(fastOpts().TTL + 100*time.Millisecond)
	wait.For(t, 1*time.Second, func() (bool, string) {
		return bHeld.Load(), "replica B never took over the lease after A died"
	})

	cancelB()
}

// TestRunWhileHeld_LostLeaseCancelsFn proves that when another party
// forcibly DELetes the lease (simulating Redis flush or hostile takeover),
// the renewer detects "lease no longer ours", cancels the scoped context,
// and fn observes the cancellation.
func TestRunWhileHeld_LostLeaseCancelsFn(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	ctx := t.Context()

	var (
		entered   = make(chan struct{}, 1)
		cancelled = make(chan struct{}, 1)
	)

	go func() {
		_ = RunWhileHeld(ctx, rdb, "lease-lost", "id-"+InstanceID(), fastOpts(), func(scoped context.Context) error {
			entered <- struct{}{}
			<-scoped.Done()
			cancelled <- struct{}{}
			return nil
		})
	}()

	select {
	case <-entered:
	case <-time.After(1 * time.Second):
		t.Fatalf("fn never started")
	}

	// Yank the lease key from underneath the renewer.
	if err := rdb.Del(context.Background(), "lease-lost").Err(); err != nil {
		t.Fatalf("Del: %v", err)
	}

	select {
	case <-cancelled:
	case <-time.After(2 * time.Second):
		t.Fatalf("fn was not notified when lease was lost")
	}
}

// TestRunWhileHeld_FnErrorTriggersReacquire confirms that a transient fn
// error causes a clean release + reacquire, not a permanent stop.
func TestRunWhileHeld_FnErrorTriggersReacquire(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var calls atomic.Int32
	done := make(chan struct{})

	go func() {
		defer close(done)
		_ = RunWhileHeld(ctx, rdb, "lease-err", "id-"+InstanceID(), fastOpts(), func(scoped context.Context) error {
			n := calls.Add(1)
			if n == 1 {
				return errors.New("simulated transient failure")
			}
			<-scoped.Done()
			return nil
		})
	}()

	wait.For(t, 2*time.Second, func() (bool, string) {
		return calls.Load() >= 2, fmt.Sprintf("expected fn to be re-invoked after error, got %d calls", calls.Load())
	})

	cancel()
	<-done
}

// TestRunWhileHeld_RejectsBadArgs covers the cheap precondition checks so
// programmer errors fail loudly rather than silently mis-leading.
func TestRunWhileHeld_RejectsBadArgs(t *testing.T) {
	t.Parallel()
	rdb := redisfake.New(t).Client
	ctx := t.Context()
	cases := []struct {
		name        string
		client      *redis.Client
		key, instID string
		fn          func(context.Context) error
	}{
		{"nil_client", nil, "k", "id", func(context.Context) error { return nil }},
		{"empty_key", rdb, "", "id", func(context.Context) error { return nil }},
		{"empty_id", rdb, "k", "", func(context.Context) error { return nil }},
		{"nil_fn", rdb, "k", "id", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := RunWhileHeld(ctx, tc.client, tc.key, tc.instID, fastOpts(), tc.fn); err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
		})
	}
}
