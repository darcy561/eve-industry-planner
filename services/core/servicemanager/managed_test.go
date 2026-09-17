package servicemanager

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/testing/wait"

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

	wait.For(t, 2*time.Second, func() (bool, string) {
		err := m.Ready(context.Background())
		return err == nil, fmt.Sprintf("standby not ready: %v", err)
	})
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

	wait.For(t, 2*time.Second, func() (bool, string) {
		err := m.Ready(context.Background())
		settled := err != nil && err.Error() != "applying primary state is_leader=true" && err.Error() != "waiting for initial primary state"
		return settled, fmt.Sprintf("ready error not yet settled: %v", err)
	})
}

// #28: lose-primary calls stop; standby Ready stays OK (handoff contract).
// Simulated time: the signals below either arrive or the bubble runs out of
// work, so a regression fails at once instead of hanging out to a real ceiling.
func TestManaged_losePrimaryStopsWorkAndStayReady(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
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
		synctest.Wait()
		select {
		case <-started:
		default:
			t.Fatal("leader work never started")
		}

		ch <- primarycontroller.State{IsLeader: false}
		synctest.Wait()
		select {
		case <-stopped:
		default:
			t.Fatal("lose-primary did not stop leader work")
		}

		if err := m.Ready(context.Background()); err != nil {
			t.Fatalf("standby not ready after lose-primary: %v", err)
		}
	})
}
