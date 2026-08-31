package nats

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

var testPolicy = RetryPolicy{Attempts: 3, InitialDelay: time.Millisecond, MaxDelay: 2 * time.Millisecond}

func TestRetry_succeedsAfterRetryableFailures(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), testPolicy, "test", func() error {
		calls++
		if calls < 3 {
			return natslib.ErrTimeout
		}
		return nil
	})
	if err != nil {
		t.Fatalf("Retry returned %v, want nil", err)
	}
	if calls != 3 {
		t.Fatalf("operation called %d times, want 3", calls)
	}
}

func TestRetry_stopsOnNonRetryable(t *testing.T) {
	sentinel := errors.New("bad subject")
	calls := 0
	err := Retry(context.Background(), testPolicy, "test", func() error {
		calls++
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("Retry returned %v, want %v", err, sentinel)
	}
	if calls != 1 {
		t.Fatalf("operation called %d times, want 1", calls)
	}
}

func TestRetry_exhaustsAttempts(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), testPolicy, "test", func() error {
		calls++
		return natslib.ErrTimeout
	})
	if err == nil {
		t.Fatal("Retry returned nil, want error")
	}
	if !errors.Is(err, natslib.ErrTimeout) {
		t.Fatalf("Retry error %v does not wrap ErrTimeout", err)
	}
	if calls != testPolicy.Attempts {
		t.Fatalf("operation called %d times, want %d", calls, testPolicy.Attempts)
	}
}

// Cancellation must end the wait rather than sleeping out the remaining backoff.
func TestRetry_cancelledContextStopsBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	slow := RetryPolicy{Attempts: 5, InitialDelay: 10 * time.Second, MaxDelay: 10 * time.Second}

	done := make(chan error, 1)
	go func() {
		done <- Retry(ctx, slow, "test", func() error { return natslib.ErrTimeout })
	}()

	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Retry returned %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Retry did not return promptly after cancellation")
	}
}

func TestRetry_cancelledContextIsNotAttempted(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls := 0
	err := Retry(ctx, testPolicy, "test", func() error {
		calls++
		return nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Retry returned %v, want context.Canceled", err)
	}
	if calls != 0 {
		t.Fatalf("operation called %d times, want 0", calls)
	}
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"cancelled", context.Canceled, false},
		{"application error", errors.New("unknown task type"), false},
		{"stream not found", jetstream.ErrStreamNotFound, false},
		{"not connected", ErrNotConnected, true},
		{"wrapped not connected", fmt.Errorf("publish: %w", ErrNotConnected), true},
		{"nats timeout", natslib.ErrTimeout, true},
		{"no servers", natslib.ErrNoServers, true},
		{"connection draining", natslib.ErrConnectionDraining, true},
		{"jetstream no stream response", jetstream.ErrNoStreamResponse, true},
		{"jetstream server shutdown", jetstream.ErrServerShutdown, true},
		{"deadline exceeded", context.DeadlineExceeded, true},
		{"dial failure", &net.OpError{Op: "dial", Err: errors.New("connection refused")}, true},
	}
	for _, tc := range tests {
		if got := IsRetryable(tc.err); got != tc.want {
			t.Errorf("IsRetryable(%s) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

// An ack is owed even when the work that produced it was cancelled.
func TestAcknowledgeMessage_ignoresCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	msg := &fakeMsg{}
	AcknowledgeMessage(ctx, msg, "test", 1)

	if msg.acks != 1 {
		t.Fatalf("Ack called %d times, want 1", msg.acks)
	}
	if msg.naks != 0 {
		t.Fatalf("Nak called %d times, want 0", msg.naks)
	}
}

type fakeMsg struct {
	jetstream.Msg
	acks int
	naks int
}

func (m *fakeMsg) Ack() error { m.acks++; return nil }

func (m *fakeMsg) NakWithDelay(time.Duration) error { m.naks++; return nil }

func (m *fakeMsg) Metadata() (*jetstream.MsgMetadata, error) {
	return &jetstream.MsgMetadata{NumDelivered: 1}, nil
}
