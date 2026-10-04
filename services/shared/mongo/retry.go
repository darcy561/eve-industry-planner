package mongo

import (
	"context"
	"errors"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/retry"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

const (
	retryMaxAttempts  = 3
	retryInitialDelay = 100 * time.Millisecond
	retryMaxDelay     = 2 * time.Second
)

// Retry runs operation with exponential backoff, retrying what [IsRetryableMongoError] accepts;
// inside a transaction it runs once and leaves retrying to the transaction.
func Retry(ctx context.Context, operationName string, operation func() error) error {
	if inTransaction(ctx) {
		return operation()
	}

	opName := operationName
	if opName == "" {
		opName = "MongoDB operation"
	}

	attempts := 0
	refused := false

	refuse := func(err error) bool {
		if IsRetryableMongoError(err) {
			return false
		}
		refused = true
		if !errors.Is(err, mongo.ErrNoDocuments) {
			logs.ErrorCtx(ctx, "MongoDB operation failed - non-retryable error",
				"operation", opName,
				"error", err)
		}
		return true
	}

	err := retry.Do(ctx,
		func(context.Context) error {
			attempts++
			return operation()
		},
		func(err error, at retry.AttemptContext) bool {
			if refuse(err) {
				return false
			}
			logs.WarnCtx(ctx, "MongoDB operation failed, retrying",
				"operation", opName,
				"attempt", at.Attempt,
				"max_attempts", at.MaxAttempts,
				"error", err)
			return true
		},
		retry.WithMaxAttempts(retryMaxAttempts),
		retry.WithInitialDelay(retryInitialDelay),
		retry.WithMaxDelay(retryMaxDelay),
		retry.WithOperationName(opName),
	)

	switch {
	case err == nil:
		if attempts > 1 {
			logs.InfoCtx(ctx, "MongoDB operation succeeded after retry",
				"operation", opName,
				"attempt", attempts)
		}
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
	case !refused && !refuse(err):
		logs.ErrorCtx(ctx, "MongoDB operation failed - all retries exhausted",
			"operation", opName,
			"attempts", attempts,
			"error", err)
	}
	return err
}

// IsRetryableMongoError reports whether err is a transient Mongo / network failure suitable for Retry.
// Prefers driver helpers (IsNetworkError / IsTimeout); keeps a narrow string fallback for SDAM messages.
func IsRetryableMongoError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, mongo.ErrNoDocuments) || errors.Is(err, mongo.ErrNilDocument) {
		return false
	}
	if errors.Is(err, mongo.ErrClientDisconnected) {
		return true
	}
	if mongo.IsNetworkError(err) || mongo.IsTimeout(err) {
		return true
	}

	errStrLower := strings.ToLower(err.Error())
	for _, retryable := range []string{
		"server selection error",
		"server selection timeout",
		"no reachable servers",
		"connection closed",
		"connection reset",
		"incomplete read",
	} {
		if strings.Contains(errStrLower, retryable) {
			return true
		}
	}
	return false
}

// RetryValue runs op under [Retry] and answers what its last attempt returned.
func RetryValue[T any](ctx context.Context, operationName string, op func() (T, error)) (T, error) {
	var out T
	err := Retry(ctx, operationName, func() error {
		var opErr error
		out, opErr = op()
		return opErr
	})
	return out, err
}
