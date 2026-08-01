package task

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestRetrySuccess(t *testing.T) {
	t.Parallel()
	n := 0
	err := Retry(context.Background(), time.Second, time.Millisecond, func() error {
		n++
		if n < 3 {
			return errors.New("not yet")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Fatalf("n=%d", n)
	}
}

func TestRetryTimeoutWrapsLast(t *testing.T) {
	t.Parallel()
	err := Retry(context.Background(), 20*time.Millisecond, 5*time.Millisecond, func() error {
		return errors.New("still failing")
	})
	if err == nil {
		t.Fatal("want timeout")
	}
	if !strings.Contains(err.Error(), "timed out") || !strings.Contains(err.Error(), "still failing") {
		t.Fatalf("%q", err)
	}
}

func TestRetryCancel(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := Retry(ctx, time.Second, time.Millisecond, func() error {
		return errors.New("x")
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("got %v", err)
	}
}

func TestWaitNilReadyRequiresService(t *testing.T) {
	t.Parallel()
	// Empty service fails before docker; no live Swarm needed.
	_, err := Wait(context.Background(), "eip", "", 10*time.Millisecond, nil)
	if err == nil || !strings.Contains(err.Error(), "service name") {
		t.Fatalf("got %v", err)
	}
}

func TestWaitTimeoutMessageRunning(t *testing.T) {
	t.Parallel()
	// Unlikely service name: Wait should time out with “running” (ready == nil).
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := Wait(ctx, "eip", "no-such-eip-service-zzzz", 40*time.Millisecond, nil)
	if err == nil {
		t.Fatal("want error")
	}
	// Either ctx deadline or wait timeout — both acceptable without Docker.
	if !errors.Is(err, context.DeadlineExceeded) &&
		!strings.Contains(err.Error(), "did not become running") &&
		!strings.Contains(err.Error(), "executable file not found") &&
		!strings.Contains(err.Error(), "docker") {
		t.Fatalf("%q", err)
	}
}
