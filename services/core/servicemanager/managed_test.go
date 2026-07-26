package servicemanager

import (
	"context"
	"errors"
	"testing"
	"time"

	"eve-industry-planner/core/primarycontroller"
)

func TestManaged_standbyAckReady(t *testing.T) {
	m := New("sched", func(context.Context) (func(), error) {
		t.Fatal("should not start on standby")
		return nil, nil
	})
	ch := make(chan primarycontroller.State, 1)
	ch <- primarycontroller.State{IsLeader: false}

	if err := m.Follow(context.Background(), ch); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Stop(context.Background()) })

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if err := m.Ready(context.Background()); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("standby never ready")
}

func TestManaged_leaderStartFailKeepsReadyError(t *testing.T) {
	m := New("sched", func(context.Context) (func(), error) {
		return nil, errors.New("boom")
	})
	ch := make(chan primarycontroller.State, 1)
	ch <- primarycontroller.State{IsLeader: true}

	if err := m.Follow(context.Background(), ch); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Stop(context.Background()) })

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		err := m.Ready(context.Background())
		if err != nil && err.Error() != "applying primary state is_leader=true" && err.Error() != "waiting for initial primary state" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("expected persistent ready error after leader start fail")
}

// #28: lose-primary calls stop; standby Ready stays OK (handoff contract).
func TestManaged_losePrimaryStopsWorkAndStayReady(t *testing.T) {
	started := make(chan struct{}, 1)
	stopped := make(chan struct{}, 1)
	m := New("sched", func(context.Context) (func(), error) {
		started <- struct{}{}
		return func() { stopped <- struct{}{} }, nil
	})
	ch := make(chan primarycontroller.State, 4)
	if err := m.Follow(context.Background(), ch); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { m.Stop(context.Background()) })

	ch <- primarycontroller.State{IsLeader: true}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("leader work never started")
	}

	ch <- primarycontroller.State{IsLeader: false}
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("lose-primary did not stop leader work")
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if err := m.Ready(context.Background()); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("standby Ready after lose-primary")
}
