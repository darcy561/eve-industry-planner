package nats

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// ErrNotConnected reports a disconnected connection at the moment an operation needed it.
var ErrNotConnected = errors.New("nats: connection is not connected")

// RetryPolicy bounds one retried operation.
type RetryPolicy struct {
	Attempts     int
	InitialDelay time.Duration
	MaxDelay     time.Duration
}

// Acknowledgement backs off less than publishing: it holds a consumer's redelivery timer open.
var (
	PublishRetry = RetryPolicy{Attempts: 5, InitialDelay: 500 * time.Millisecond, MaxDelay: 5 * time.Second}
	AckRetry     = RetryPolicy{Attempts: 3, InitialDelay: 100 * time.Millisecond, MaxDelay: 400 * time.Millisecond}
)

// Retry runs operation under policy. Backoff waits honour ctx.
func Retry(ctx context.Context, policy RetryPolicy, operationName string, operation func() error) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if policy.Attempts < 1 {
		policy.Attempts = 1
	}
	opName := operationName
	if opName == "" {
		opName = "NATS operation"
	}

	var lastErr error
	for attempt := range policy.Attempts {
		if err := ctx.Err(); err != nil {
			return err
		}

		err := operation()
		if err == nil {
			if attempt > 0 {
				logs.InfoCtx(ctx, "NATS operation succeeded after retry",
					"operation", opName,
					"attempt", attempt+1)
			}
			return nil
		}
		lastErr = err

		if !IsRetryable(err) {
			logs.WarnCtx(ctx, "NATS operation failed - non-retryable error",
				"operation", opName,
				"error", err)
			return err
		}

		if attempt == policy.Attempts-1 {
			break
		}

		delay := min(policy.InitialDelay*time.Duration(1<<attempt), policy.MaxDelay)
		logs.InfoCtx(ctx, "NATS operation failed, retrying",
			"operation", opName,
			"attempt", attempt+1,
			"max_attempts", policy.Attempts,
			"delay_ms", delay.Milliseconds(),
			"error", err)

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}

	logs.ErrorCtx(ctx, "NATS operation failed - all attempts exhausted",
		"operation", opName,
		"attempts", policy.Attempts,
		"error", lastErr)
	return fmt.Errorf("NATS operation failed after %d attempts: %w", policy.Attempts, lastErr)
}

// IsRetryable reports whether err is a transient connection, stream, or timeout failure.
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, ErrNotConnected) {
		return true
	}
	switch {
	case errors.Is(err, natslib.ErrConnectionClosed),
		errors.Is(err, natslib.ErrConnectionDraining),
		errors.Is(err, natslib.ErrConnectionReconnecting),
		errors.Is(err, natslib.ErrDisconnected),
		errors.Is(err, natslib.ErrInvalidConnection),
		errors.Is(err, natslib.ErrNoResponders),
		errors.Is(err, natslib.ErrNoServers),
		errors.Is(err, natslib.ErrTimeout):
		return true
	}
	switch {
	case errors.Is(err, jetstream.ErrConnectionClosed),
		errors.Is(err, jetstream.ErrNoStreamResponse),
		errors.Is(err, jetstream.ErrServerShutdown):
		return true
	}
	if _, ok := errors.AsType[net.Error](err); ok {
		return true
	}

	// A publish carries its own deadline, so this is the server not answering.
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	// Backstop for responses that arrive as plain messages, not sentinels.
	msg := strings.ToLower(err.Error())
	for _, retryable := range []string{
		"no response from stream",
		"connection closed",
		"connection reset",
		"no responders",
	} {
		if strings.Contains(msg, retryable) {
			return true
		}
	}
	return false
}
