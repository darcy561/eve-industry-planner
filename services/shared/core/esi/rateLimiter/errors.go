package ratelimiter

import (
	"errors"
	"fmt"
	"time"
)

// RateLimitError represents a rate limit error with classification for task handling
type RateLimitError struct {
	// Retryable indicates if this error should trigger a retry
	Retryable bool
	// RetryAfter is the time when retry should be attempted (if Retryable is true)
	RetryAfter time.Time
	// Reason describes the reason for rate limiting
	Reason string
	// Group is the rate limit group name
	Group string
	// TokenUsed is the current tokens used
	TokenUsed int
	// TokenLimit is the token limit
	TokenLimit int
	// EstimatedTokens is the tokens needed for the request
	EstimatedTokens int
}

func (e *RateLimitError) Error() string {
	if e.Retryable {
		waitTime := time.Until(e.RetryAfter)
		return fmt.Sprintf("rate limit %s (retryable, retry after %v, waiting %v)", e.Reason, e.RetryAfter, waitTime)
	}
	return fmt.Sprintf("rate limit %s (non-retryable)", e.Reason)
}

// IsRetryableRateLimitError checks if an error is a retryable rate limit error
func IsRetryableRateLimitError(err error) bool {
	var rateLimitErr *RateLimitError
	return errors.As(err, &rateLimitErr) && rateLimitErr.Retryable
}

// IsRateLimitError checks if an error is any rate limit error
func IsRateLimitError(err error) bool {
	var rateLimitErr *RateLimitError
	return errors.As(err, &rateLimitErr)
}

// GetRateLimitError extracts RateLimitError from an error if present
func GetRateLimitError(err error) *RateLimitError {
	var rateLimitErr *RateLimitError
	if errors.As(err, &rateLimitErr) {
		return rateLimitErr
	}
	return nil
}
