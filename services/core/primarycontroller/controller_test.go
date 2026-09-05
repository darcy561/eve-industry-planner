package primarycontroller

import (
	"context"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/testing/wait"

	"eve-industry-planner/testing/redisfake"
)

func TestStart_requiresRedis(t *testing.T) {
	if err := New(nil).Start(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}

func TestSubscribe_notifiesOnAcquireAndStop(t *testing.T) {
	rdb := redisfake.New(t).Client

	s, err := Start(context.Background(), rdb)
	if err != nil {
		t.Fatal(err)
	}

	ch := s.Subscribe()
	wait.For(t, 3*time.Second, func() (bool, string) {
		for {
			select {
			case st := <-ch:
				if st.IsLeader {
					return true, ""
				}
			default:
				return false, "no IsLeader=true state published yet"
			}
		}
	})
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
}

func waitLeaderPair(t *testing.T, a, b *Service, deadline time.Duration) (leader, standby *Service) {
	t.Helper()
	wait.For(t, deadline, func() (bool, string) {
		aLead, bLead := a.IsLeader(), b.IsLeader()
		switch {
		case aLead && !bLead:
			leader, standby = a, b
			return true, ""
		case bLead && !aLead:
			leader, standby = b, a
			return true, ""
		case aLead && bLead:
			t.Fatal("both replicas report IsLeader")
		}
		return false, fmt.Sprintf("no single leader (a=%v b=%v)", aLead, bLead)
	})
	return leader, standby
}

// #28: exactly one primary; standby Ready OK without holding the lease; Stop→takeover.
func TestDualReplica_singleLeaderStandbyReadyAndTakeover(t *testing.T) {
	rdb := redisfake.New(t).Client

	a, err := Start(context.Background(), rdb)
	if err != nil {
		t.Fatal(err)
	}
	b, err := Start(context.Background(), rdb)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		a.Stop(context.Background())
		b.Stop(context.Background())
	})

	leader, standby := waitLeaderPair(t, a, b, 8*time.Second)

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

	wait.For(t, 12*time.Second, func() (bool, string) {
		return prevStandby.IsLeader(), "standby has not taken over after leader Stop"
	})
	if err := prevStandby.Ready(context.Background()); err != nil {
		t.Fatalf("new leader Ready: %v", err)
	}
}
