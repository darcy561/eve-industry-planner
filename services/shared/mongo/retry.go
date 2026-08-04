package mongo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

const (
	retryMaxAttempts  = 3
	retryInitialDelay = 100 * time.Millisecond
	retryMaxDelay     = 2 * time.Second
)

// Retry runs operation with exponential backoff (3 attempts, 100ms → 2s).
// operationName is used only for logs (empty → "MongoDB operation").
func Retry(ctx context.Context, operationName string, operation func() error) error {
	return retryMongoOperation(ctx, operationName, retryMaxAttempts, retryInitialDelay, retryMaxDelay, operation)
}

// IsRetryableMongoError reports whether err looks like a transient Mongo / network failure
// (substring match on the error text).
func IsRetryableMongoError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()
	retryableErrors := []string{
		"server selection error",
		"server selection timeout",
		"connection timeout",
		"i/o timeout",
		"context deadline exceeded",
		"no reachable servers",
		"connection(mongo",
		"incomplete read",
		"network error",
		"connection closed",
		"connection reset",
	}

	errStrLower := strings.ToLower(errStr)
	for _, retryable := range retryableErrors {
		if strings.Contains(errStrLower, strings.ToLower(retryable)) {
			return true
		}
	}

	return false
}

func retryMongoOperation(
	ctx context.Context,
	operationName string,
	maxRetries int,
	initialDelay, maxDelay time.Duration,
	operation func() error,
) error {
	opName := operationName
	if opName == "" {
		opName = "MongoDB operation"
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := operation()
		if err == nil {
			if attempt > 0 {
				logs.InfoCtx(ctx, "MongoDB operation succeeded after retry",
					"operation", opName,
					"attempt", attempt+1)
			}
			return nil
		}

		lastErr = err

		if !IsRetryableMongoError(err) {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return err
			}
			logs.ErrorCtx(ctx, "MongoDB operation failed - non-retryable error",
				"operation", opName,
				"error", err)
			return err
		}

		if attempt == maxRetries-1 {
			break
		}

		delay := initialDelay * time.Duration(1<<attempt)
		if delay > maxDelay {
			delay = maxDelay
		}

		logs.WarnCtx(ctx, "MongoDB operation failed, retrying",
			"operation", opName,
			"attempt", attempt+1,
			"max_retries", maxRetries,
			"delay_ms", delay.Milliseconds(),
			"error", err)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}

	logs.ErrorCtx(ctx, "MongoDB operation failed - all retries exhausted",
		"operation", opName,
		"attempts", maxRetries,
		"error", lastErr)
	return fmt.Errorf("MongoDB operation failed after %d attempts: %w", maxRetries, lastErr)
}
