package mongo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/shared/logs"
)

// RetryConfig holds configuration for MongoDB operation retries
type RetryConfig struct {
	MaxRetries    int           // Maximum number of retry attempts (default: 3)
	InitialDelay  time.Duration // Initial delay before first retry (default: 100ms)
	MaxDelay      time.Duration // Maximum delay between retries (default: 2s)
	OperationName string        // Name of operation for logging (optional)
}

// DefaultRetryConfig returns a retry config with sensible defaults
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:   3,
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     2 * time.Second,
	}
}

// IsRetryableMongoError checks if a MongoDB error is transient and should be retried
func IsRetryableMongoError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()
	// Check for transient MongoDB errors that should be retried
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

// RetryMongoOperation executes a MongoDB operation with retry logic and exponential backoff
// The operation function should return an error if it fails, or nil on success
// Returns the error from the operation (wrapped with retry context if all retries exhausted)
func RetryMongoOperation(ctx context.Context, config RetryConfig, operation func() error) error {
	if config.MaxRetries <= 0 {
		config.MaxRetries = 3
	}
	if config.InitialDelay <= 0 {
		config.InitialDelay = 100 * time.Millisecond
	}
	if config.MaxDelay <= 0 {
		config.MaxDelay = 2 * time.Second
	}

	var lastErr error
	for attempt := 0; attempt < config.MaxRetries; attempt++ {
		// Check context before retry
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Execute the operation
		err := operation()
		if err == nil {
			// Success - return immediately
			if attempt > 0 {
				opName := config.OperationName
				if opName == "" {
					opName = "MongoDB operation"
				}
				logs.Info("MongoDB operation succeeded after retry",
					"operation", opName,
					"attempt", attempt+1)
			}
			return nil
		}

		lastErr = err

		// Check if error is retryable
		if !IsRetryableMongoError(err) {
			// Not a retryable error - return immediately
			opName := config.OperationName
			if opName == "" {
				opName = "MongoDB operation"
			}
			logs.Error("MongoDB operation failed - non-retryable error",
				"operation", opName,
				"error", err)
			return err
		}

		// If this is the last attempt, don't sleep
		if attempt == config.MaxRetries-1 {
			break
		}

		// Calculate exponential backoff delay
		delay := config.InitialDelay * time.Duration(1<<attempt)
		if delay > config.MaxDelay {
			delay = config.MaxDelay
		}

		opName := config.OperationName
		if opName == "" {
			opName = "MongoDB operation"
		}
		logs.Warn("MongoDB operation failed, retrying",
			"operation", opName,
			"attempt", attempt+1,
			"max_retries", config.MaxRetries,
			"delay_ms", delay.Milliseconds(),
			"error", err)

		// Wait with context cancellation support
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
			// Continue to next retry
		}
	}

	// All retries exhausted
	opName := config.OperationName
	if opName == "" {
		opName = "MongoDB operation"
	}
	logs.Error("MongoDB operation failed - all retries exhausted",
		"operation", opName,
		"attempts", config.MaxRetries,
		"error", lastErr)
	return fmt.Errorf("MongoDB operation failed after %d attempts: %w", config.MaxRetries, lastErr)
}
