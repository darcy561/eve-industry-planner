package mongoget

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
)

type retryConfig struct {
	maxRetries    int
	initialDelay  time.Duration
	maxDelay      time.Duration
	operationName string
}

func defaultRetryConfig(operationName string) retryConfig {
	return retryConfig{
		maxRetries:    3,
		initialDelay:  100 * time.Millisecond,
		maxDelay:      2 * time.Second,
		operationName: operationName,
	}
}

func retryMongoOperation(ctx context.Context, cfg retryConfig, operation func() error) error {
	var lastErr error
	for attempt := 0; attempt < cfg.maxRetries; attempt++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := operation()
		if err == nil {
			if attempt > 0 {
				logs.InfoCtx(ctx, "MongoDB operation succeeded after retry",
					"operation", cfg.operationName,
					"attempt", attempt+1,
				)
			}
			return nil
		}

		lastErr = err
		if !isRetryableMongoError(err) || attempt == cfg.maxRetries-1 {
			break
		}

		delay := cfg.initialDelay * time.Duration(1<<attempt)
		if delay > cfg.maxDelay {
			delay = cfg.maxDelay
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}

	return fmt.Errorf("%s failed after %d retries: %w", cfg.operationName, cfg.maxRetries, lastErr)
}

func isRetryableMongoError(err error) bool {
	if err == nil {
		return false
	}

	errStrLower := strings.ToLower(err.Error())
	for _, retryable := range []string{
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
	} {
		if strings.Contains(errStrLower, retryable) {
			return true
		}
	}

	return false
}
