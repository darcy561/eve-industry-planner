package ops

import (
	"context"
	"errors"
	"testing"
	"testing/synctest"
	"time"

	"eve-industry-planner/deployment-tool/internal/dataplane"
)

// The ensure waiter polls on a 3s tick. Under synctest that time is simulated,
// so these assert real poll/settle behaviour without wall-clock waits.

func ensureStub(short string, running func() (bool, error)) dataplane.ServiceEnsure {
	return dataplane.ServiceEnsure{
		Short:       short,
		Label:       short,
		Run:         func(context.Context, string) error { return nil },
		TaskRunning: func(context.Context, string) (bool, error) { return running() },
	}
}

func TestWaitForEnsureTasksReturnsWhenTasksAppear(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		mongoCalls, s3Calls := 0, 0
		registry := []dataplane.ServiceEnsure{
			ensureStub("mongo", func() (bool, error) { mongoCalls++; return mongoCalls >= 3, nil }),
			ensureStub("s3", func() (bool, error) { s3Calls++; return s3Calls >= 5, nil }),
		}

		start := time.Now()
		err := waitForEnsureTasksIn(t.Context(), "eip", []string{"mongo", "s3"}, registry, 2*time.Minute)
		if err != nil {
			t.Fatalf("waitForEnsureTasksIn: %v", err)
		}

		// Shorts are polled together, so elapsed tracks the slowest (s3: 5 polls
		// = 4 sleeps), not the sum of both.
		if got, want := time.Since(start), 12*time.Second; got != want {
			t.Errorf("elapsed = %v, want %v", got, want)
		}
		// mongo settled first and must stop being polled.
		if mongoCalls != 3 {
			t.Errorf("mongo polled %d times, want 3 (no polling after ready)", mongoCalls)
		}
	})
}

func TestWaitForEnsureTasksGivesUpAtBudget(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		registry := []dataplane.ServiceEnsure{
			ensureStub("mongo", func() (bool, error) { return false, nil }),
		}

		start := time.Now()
		// Never ready: returns nil at the budget so RunEnsuresFor may still skip.
		if err := waitForEnsureTasksIn(t.Context(), "eip", []string{"mongo"}, registry, 30*time.Second); err != nil {
			t.Fatalf("waitForEnsureTasksIn: %v", err)
		}
		if got := time.Since(start); got < 30*time.Second {
			t.Errorf("gave up after %v, want >= 30s", got)
		}
	})
}

func TestWaitForEnsureTasksPropagatesProbeError(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		wantErr := errors.New("probe failed")
		registry := []dataplane.ServiceEnsure{
			ensureStub("mongo", func() (bool, error) { return false, wantErr }),
		}
		err := waitForEnsureTasksIn(t.Context(), "eip", []string{"mongo"}, registry, time.Minute)
		if !errors.Is(err, wantErr) {
			t.Fatalf("err = %v, want %v", err, wantErr)
		}
	})
}

func TestWaitForEnsureTasksHonoursCancel(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		registry := []dataplane.ServiceEnsure{
			ensureStub("mongo", func() (bool, error) { return false, nil }),
		}
		go func() {
			time.Sleep(10 * time.Second)
			cancel()
		}()
		err := waitForEnsureTasksIn(ctx, "eip", []string{"mongo"}, registry, time.Hour)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("err = %v, want context.Canceled", err)
		}
	})
}

func TestWaitForEnsureTasksSkipsUnknownShorts(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		// A short with no registry entry is not waited on.
		if err := waitForEnsureTasksIn(t.Context(), "eip", []string{"nope"}, nil, time.Hour); err != nil {
			t.Fatalf("waitForEnsureTasksIn: %v", err)
		}
	})
}
