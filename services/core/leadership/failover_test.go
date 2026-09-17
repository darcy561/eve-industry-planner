package leadership_test

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/core/primarycontroller"
	"eve-industry-planner/core/servicemanager"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"
)

func fastLeaseOpts() eipredis.LeaseOptions {
	return eipredis.LeaseOptions{
		TTL:            400 * time.Millisecond,
		RenewInterval:  80 * time.Millisecond,
		AcquireBackoff: 50 * time.Millisecond,
	}
}

func fakePublisher(active, publishes *atomic.Int32, owner *atomic.Value, id string) servicemanager.StartLeader {
	return func(context.Context) (func(), error) {
		active.Add(1)
		owner.Store(id)
		done := make(chan struct{})
		go func() {
			t := time.NewTicker(5 * time.Millisecond)
			defer t.Stop()
			for {
				select {
				case <-done:
					return
				case <-t.C:
					publishes.Add(1)
				}
			}
		}()
		return func() {
			close(done)
			active.Add(-1)
		}, nil
	}
}

func waitLeaderPair(t *testing.T, r *redisfake.Redis, a, b *primarycontroller.Service, within time.Duration) (leader, standby *primarycontroller.Service) {
	t.Helper()
	wait.ForTicking(t, within, leaseStep, r.Advance, func() (bool, string) {
		aLead, bLead := a.IsLeader(), b.IsLeader()
		switch {
		case aLead && bLead:
			t.Fatal("both replicas report IsLeader")
		case aLead:
			leader, standby = a, b
			return true, ""
		case bLead:
			leader, standby = b, a
			return true, ""
		}
		return false, fmt.Sprintf("no single leader (a=%v b=%v)", aLead, bLead)
	})
	return leader, standby
}

func waitManagedReady(t *testing.T, r *redisfake.Redis, m *servicemanager.Managed, within time.Duration) {
	t.Helper()
	wait.ForTicking(t, within, leaseStep, r.Advance, func() (bool, string) {
		err := m.Ready(context.Background())
		return err == nil, fmt.Sprintf("managed not Ready: %v", err)
	})
}

func waitActiveOwner(t *testing.T, r *redisfake.Redis, active *atomic.Int32, owner *atomic.Value, want string, within time.Duration) {
	t.Helper()
	wait.ForTicking(t, within, leaseStep, r.Advance, func() (bool, string) {
		got, _ := owner.Load().(string)
		held := active.Load()
		return held == 1 && got == want,
			fmt.Sprintf("want active owner %q; got owner=%q active=%d", want, got, held)
	})
}

// leaseStep is how far the pair of clocks moves between checks. Small enough
// that a fast lease cannot expire and be reacquired inside one step.
const leaseStep = 25 * time.Millisecond

func assertNoDualLeader(t *testing.T, a, b *primarycontroller.Service) {
	t.Helper()
	if a.IsLeader() && b.IsLeader() {
		t.Fatal("both replicas report IsLeader")
	}
}

func watchSustainedDualActive(active *atomic.Int32, maxOverlap time.Duration) (stop func(), violated *atomic.Bool) {
	var bad atomic.Bool
	done := make(chan struct{})
	go func() {
		var since time.Time
		tick := time.NewTicker(5 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-done:
				return
			case <-tick.C:
				if active.Load() > 1 {
					if since.IsZero() {
						since = time.Now()
					} else if time.Since(since) > maxOverlap {
						bad.Store(true)
						return
					}
				} else {
					since = time.Time{}
				}
			}
		}
	}()
	return func() { close(done) }, &bad
}

// #28: two primarycontroller replicas + Managed publishers on shared Redis —
// never dual IsLeader; steady-state exactly one armed publisher; Stop→takeover
// moves the publisher; no sustained dual arming.
func TestDualReplica_exactlyOnePublisherAndTakeover(t *testing.T) {
	r := redisfake.NewForBubble(t)
	synctest.Test(t, func(t *testing.T) {
		rdb := r.Client

		opts := fastLeaseOpts()
		a, err := primarycontroller.StartWithOptions(context.Background(), eipredis.NewRedis(rdb), opts)
		if err != nil {
			t.Fatal(err)
		}
		b, err := primarycontroller.StartWithOptions(context.Background(), eipredis.NewRedis(rdb), opts)
		if err != nil {
			t.Fatal(err)
		}

		var active, publishes atomic.Int32
		var owner atomic.Value

		ma := servicemanager.New("publisher-a", fakePublisher(&active, &publishes, &owner, "a"))
		mb := servicemanager.New("publisher-b", fakePublisher(&active, &publishes, &owner, "b"))
		if err := ma.Follow(context.Background(), a.Subscribe()); err != nil {
			t.Fatal(err)
		}
		if err := mb.Follow(context.Background(), b.Subscribe()); err != nil {
			t.Fatal(err)
		}

		stopWatch, dualViolated := watchSustainedDualActive(&active, 150*time.Millisecond)
		t.Cleanup(func() {
			stopWatch()
			ma.Stop(context.Background())
			mb.Stop(context.Background())
			a.Stop(context.Background())
			b.Stop(context.Background())
		})

		leader, _ := waitLeaderPair(t, r, a, b, 3*time.Second)
		waitManagedReady(t, r, ma, 2*time.Second)
		waitManagedReady(t, r, mb, 2*time.Second)

		leaderID := "a"
		standbyID := "b"
		surviving := b
		if leader == b {
			leaderID, standbyID = "b", "a"
			surviving = a
		}
		waitActiveOwner(t, r, &active, &owner, leaderID, 2*time.Second)

		baseline := publishes.Load()
		for steady := time.Duration(0); steady < 200*time.Millisecond; steady += 5 * time.Millisecond {
			assertNoDualLeader(t, a, b)
			if n := active.Load(); n != 1 {
				t.Fatalf("steady-state active=%d want 1", n)
			}
			r.Advance(5 * time.Millisecond)
		}
		if publishes.Load() <= baseline {
			t.Fatal("leader did not publish during steady state")
		}

		pubBeforeStop := publishes.Load()
		leader.Stop(context.Background())

		waitActiveOwner(t, r, &active, &owner, standbyID, 3*time.Second)
		if !surviving.IsLeader() {
			t.Fatal("surviving replica is not leader after Stop")
		}
		assertNoDualLeader(t, a, b)

		wait.ForTicking(t, 2*time.Second, leaseStep, r.Advance, func() (bool, string) {
			assertNoDualLeader(t, a, b)
			if dualViolated.Load() {
				t.Fatal("sustained dual armed publishers during handoff")
			}
			return active.Load() == 1 && publishes.Load() > pubBeforeStop,
				fmt.Sprintf("new leader has not published after takeover (active=%d publishes=%d→%d)",
					active.Load(), pubBeforeStop, publishes.Load())
		})
	})
}

// Takeover SLA for clean Stop (lease released): standby arms within acquire
// backoff budget. Crash/TTL path: lease.TestRunWhileHeld_TakeoverAfterLeaderDies.
func TestDualReplica_takeoverBoundOnStop(t *testing.T) {
	r := redisfake.NewForBubble(t)
	synctest.Test(t, func(t *testing.T) {
		rdb := r.Client

		opts := fastLeaseOpts()
		const takeoverBound = 2 * time.Second

		a, err := primarycontroller.StartWithOptions(context.Background(), eipredis.NewRedis(rdb), opts)
		if err != nil {
			t.Fatal(err)
		}
		b, err := primarycontroller.StartWithOptions(context.Background(), eipredis.NewRedis(rdb), opts)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			a.Stop(context.Background())
			b.Stop(context.Background())
		})

		leader, standby := waitLeaderPair(t, r, a, b, 3*time.Second)
		leader.Stop(context.Background())

		start := time.Now()
		wait.ForTicking(t, takeoverBound, leaseStep, r.Advance, func() (bool, string) {
			return standby.IsLeader(),
				fmt.Sprintf("standby has not taken over after clean Stop (elapsed %s)", time.Since(start))
		})
		t.Logf("takeover after clean Stop in %s (bound %s)", time.Since(start), takeoverBound)
	})
}
