package primarycontroller

import (
	"context"
	"fmt"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"

	eipredis "eve-industry-planner/shared/redis"
)

func TestStart_requiresRedis(t *testing.T) {
	if err := New(nil).Start(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}

func TestSubscribe_notifiesOnAcquireAndStop(t *testing.T) {
	r := redisfake.NewForBubble(t)
	synctest.Test(t, func(t *testing.T) {
		s, err := Start(context.Background(), eipredis.NewRedis(r.Client))
		if err != nil {
			t.Fatal(err)
		}

		ch := s.Subscribe()
		synctest.Wait()
		leading := false
		for !leading {
			select {
			case st := <-ch:
				leading = st.IsLeader
			default:
				t.Fatal("no IsLeader=true state published")
			}
		}
		if err := s.Ready(context.Background()); err != nil {
			t.Fatalf("Ready: %v", err)
		}

		done := make(chan struct{})
		go func() {
			s.Stop(context.Background())
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("stop did not drain")
		}
	})
}

func waitLeaderPair(t *testing.T, r *redisfake.Redis, a, b *Service, within time.Duration) (leader, standby *Service) {
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

// leaseStep is how far both clocks move between checks, short enough that a
// lease cannot expire and be retaken inside one step.
const leaseStep = 250 * time.Millisecond

// #28: exactly one primary; standby Ready OK without holding the lease; Stop→takeover.
func TestDualReplica_singleLeaderStandbyReadyAndTakeover(t *testing.T) {
	r := redisfake.NewForBubble(t)
	synctest.Test(t, func(t *testing.T) {
		a, err := Start(context.Background(), eipredis.NewRedis(r.Client))
		if err != nil {
			t.Fatal(err)
		}
		b, err := Start(context.Background(), eipredis.NewRedis(r.Client))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			a.Stop(context.Background())
			b.Stop(context.Background())
		})

		leader, standby := waitLeaderPair(t, r, a, b, 8*time.Second)

		if err := leader.Ready(context.Background()); err != nil {
			t.Fatalf("leader Ready: %v", err)
		}
		if err := standby.Ready(context.Background()); err != nil {
			t.Fatalf("standby Ready (must not require lease): %v", err)
		}
		if standby.IsLeader() {
			t.Fatal("standby unexpectedly IsLeader")
		}

		prevStandby := standby
		leader.Stop(context.Background())

		wait.ForTicking(t, 12*time.Second, leaseStep, r.Advance, func() (bool, string) {
			return prevStandby.IsLeader(), "standby has not taken over after leader Stop"
		})
		if err := prevStandby.Ready(context.Background()); err != nil {
			t.Fatalf("new leader Ready: %v", err)
		}
	})
}
