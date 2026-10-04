package mongo

import (
	"bytes"
	"context"
	"errors"
	"os"
	"testing"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

func TestIsRetryableMongoError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "canceled", err: context.Canceled, want: false},
		{name: "no documents", err: mongo.ErrNoDocuments, want: false},
		{name: "client disconnected", err: mongo.ErrClientDisconnected, want: true},
		{name: "server selection string", err: errors.New("server selection error: no reachable servers"), want: true},
		{name: "generic app error", err: errors.New("duplicate key"), want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsRetryableMongoError(tc.err); got != tc.want {
				t.Fatalf("IsRetryableMongoError(%v)=%v want %v", tc.err, got, tc.want)
			}
		})
	}
}

var errRetryable = errors.New("server selection error: no reachable servers")

func TestRetry_succeedsWithoutRetrying(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), "test", func() error {
		calls++
		return nil
	})

	if err != nil {
		t.Fatalf("Retry returned %v, want nil", err)
	}
	if calls != 1 {
		t.Fatalf("operation called %d times, want 1", calls)
	}
}

func TestRetry_succeedsAfterRetryableFailure(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), "test", func() error {
		calls++
		if calls < 2 {
			return errRetryable
		}
		return nil
	})

	if err != nil {
		t.Fatalf("Retry returned %v, want nil", err)
	}
	if calls != 2 {
		t.Fatalf("operation called %d times, want 2", calls)
	}
}

func TestRetry_exhaustedReturnsCause(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), "test", func() error {
		calls++
		return errRetryable
	})

	if err != errRetryable {
		t.Fatalf("Retry returned %v, want the cause %v unwrapped", err, errRetryable)
	}
	if calls != retryMaxAttempts {
		t.Fatalf("operation called %d times, want %d", calls, retryMaxAttempts)
	}
}

func TestRetry_stopsOnNonRetryable(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), "test", func() error {
		calls++
		return errors.New("duplicate key error")
	})

	if err == nil {
		t.Fatal("Retry returned nil, want error")
	}
	if calls != 1 {
		t.Fatalf("operation called %d times, want 1", calls)
	}
}

func TestRetry_missingDocumentIsNotRetried(t *testing.T) {
	calls := 0
	err := Retry(context.Background(), "test", func() error {
		calls++
		return mongo.ErrNoDocuments
	})

	if !errors.Is(err, mongo.ErrNoDocuments) {
		t.Fatalf("Retry returned %v, want ErrNoDocuments", err)
	}
	if calls != 1 {
		t.Fatalf("operation called %d times, want 1", calls)
	}
}

func TestRetry_nonRetryableOnLastAttempt(t *testing.T) {
	calls := 0
	nonRetryable := errors.New("duplicate key error")
	err := Retry(context.Background(), "test", func() error {
		calls++
		if calls < retryMaxAttempts {
			return errRetryable
		}
		return nonRetryable
	})

	if err != nonRetryable {
		t.Fatalf("Retry returned %v, want %v", err, nonRetryable)
	}
	if calls != retryMaxAttempts {
		t.Fatalf("operation called %d times, want %d", calls, retryMaxAttempts)
	}
}

func TestRetry_cancelledContextIsNotAttempted(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	calls := 0
	err := Retry(ctx, "test", func() error {
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

func TestRetry_cancelledContextStopsBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	calls := 0
	err := Retry(ctx, "test", func() error {
		calls++
		cancel()
		return errRetryable
	})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Retry returned %v, want context.Canceled", err)
	}
	if calls != 1 {
		t.Fatalf("operation called %d times, want 1", calls)
	}
}

func TestRetry_hasNoLoopOfItsOwn(t *testing.T) {
	src, err := os.ReadFile("retry.go")
	if err != nil {
		t.Fatalf("reading retry.go: %v", err)
	}
	if bytes.Contains(src, []byte("time.After")) || bytes.Contains(src, []byte("time.NewTimer")) {
		t.Error("retry.go waits on a timer directly, want the backoff in shared/retry")
	}
}

func TestRetryValue_answersWhatTheAttemptThatSucceededReturned(t *testing.T) {
	t.Parallel()

	attempts := 0
	got, err := RetryValue(context.Background(), "RetryValue", func() (string, error) {
		attempts++
		if attempts == 1 {
			return "first", mongo.ErrClientDisconnected
		}
		return "second", nil
	})

	if err != nil || got != "second" || attempts != 2 {
		t.Errorf("got %q, %v after %d attempts, want the second attempt's value", got, err, attempts)
	}
}
