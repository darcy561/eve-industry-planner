package primarycontroller

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestStart_requiresRedis(t *testing.T) {
	if err := New(nil).Start(context.Background()); err == nil {
		t.Fatal("expected error")
	}
}

func TestSubscribe_notifiesOnAcquireAndStop(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s, err := Start(context.Background(), rdb)
	if err != nil {
		t.Fatal(err)
	}

	ch := s.Subscribe()
	deadline := time.Now().Add(3 * time.Second)
	sawLeader := false
	for time.Now().Before(deadline) {
		select {
		case st := <-ch:
			if st.IsLeader {
				sawLeader = true
			}
		default:
			time.Sleep(10 * time.Millisecond)
		}
		if sawLeader {
			break
		}
	}
	if !sawLeader {
		t.Fatal("never saw IsLeader true")
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
}

func waitLeaderPair(t *testing.T, a, b *Service, deadline time.Duration) (leader, standby *Service) {
	t.Helper()
	end := time.Now().Add(deadline)
	for time.Now().Before(end) {
		aLead, bLead := a.IsLeader(), b.IsLeader()
		switch {
		case aLead && !bLead:
			return a, b
		case bLead && !aLead:
			return b, a
		case aLead && bLead:
			t.Fatal("both replicas report IsLeader")
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for single leader (a=%v b=%v)", a.IsLeader(), b.IsLeader())
	return nil, nil
}

// #28: exactly one primary; standby Ready OK without holding the lease; Stop→takeover.
func TestDualReplica_singleLeaderStandbyReadyAndTakeover(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

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

	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		if prevStandby.IsLeader() {
			if err := prevStandby.Ready(context.Background()); err != nil {
				t.Fatalf("new leader Ready: %v", err)
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("standby did not take over after leader Stop")
}
