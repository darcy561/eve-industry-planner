package tasks

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	esicore "eve-industry-planner/worker/esi"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"
)

// countingReader counts bytes read from an underlying reader
type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

// parseCacheSeconds extracts max-age seconds from Cache-Control or computes from Expires header
func parseCacheSeconds(resp *http.Response) int {
	cc := resp.Header.Get("Cache-Control")
	if cc != "" {
		parts := strings.Split(cc, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if strings.HasPrefix(p, "max-age=") {
				v := strings.TrimPrefix(p, "max-age=")
				if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
					return secs
				}
			}
		}
	}
	if exp := resp.Header.Get("Expires"); exp != "" {
		if t, err := http.ParseTime(exp); err == nil {
			d := time.Until(t)
			if d > 0 {
				return int(d.Seconds())
			}
		}
	}
	return 0
}

// HandleStatusCheckResult handles the result of a server status check, returning nil if processing should continue.
// Returns an error if the status check failed - asynq will automatically retry on error.
// taskName is used for logging purposes (e.g., "system indexes refresh", "adjusted prices refresh").
func HandleStatusCheckResult(ctx context.Context, statusResult esicore.StatusResult, taskName string) error {
	if statusResult.Available {
		logs.DebugCtx(ctx, "server status check passed, proceeding with refresh",
			"cached", statusResult.Cached,
			"task", taskName)
		return nil
	}

	// Server not available - return error for asynq to retry
	if statusResult.Error != nil {
		if esiratelimiter.IsRateLimitError(statusResult.Error) {
			rateLimitErr := esiratelimiter.GetRateLimitError(statusResult.Error)
			logs.InfoCtx(ctx, "server status check rate limited",
				"retryable", rateLimitErr.Retryable,
				"retry_after", rateLimitErr.RetryAfter,
				"reason", rateLimitErr.Reason,
				"group", rateLimitErr.Group,
				"task", taskName)
			// Return error - asynq will retry with exponential backoff
			return fmt.Errorf("rate limited: %w", statusResult.Error)
		}
		// Other error - server unavailable
		logs.WarnCtx(ctx, "server status check failed, servers may be unavailable",
			"error", statusResult.Error,
			"task", taskName)
		return fmt.Errorf("server unavailable: %w", statusResult.Error)
	}

	// Available is false but no error - shouldn't happen, but handle gracefully
	logs.WarnCtx(ctx, "server status check indicates servers unavailable",
		"task", taskName)
	return fmt.Errorf("server unavailable")
}

// HandleStreamError handles errors from ESI streaming operations, including rate limit errors.
// Logs the error and returns it so asynq can retry.
// taskName is used for logging (e.g., "system indexes refresh", "adjusted prices refresh").
func HandleStreamError(ctx context.Context, err error, taskName string) error {
	if err == nil {
		return nil
	}

	logs.DebugCtx(ctx, "stream error returned", "error", err, "error_type", fmt.Sprintf("%T", err), "task", taskName)

	// Check if this is a rate limit error
	if esiratelimiter.IsRateLimitError(err) {
		rateLimitErr := esiratelimiter.GetRateLimitError(err)
		logs.DebugCtx(ctx, "detected rate limit error in refresh",
			"retryable", rateLimitErr.Retryable,
			"retry_after", rateLimitErr.RetryAfter,
			"reason", rateLimitErr.Reason,
			"group", rateLimitErr.Group,
			"task", taskName)
		// Return error - asynq will retry with exponential backoff
		return err
	}

	// Handle non-rate-limit stream errors
	logs.ErrorCtx(ctx, "failed streaming ESI data",
		"error", err,
		"error_type", fmt.Sprintf("%T", err),
		"reason", "stream_error",
		"task", taskName)
	return err
}

// ShouldStopRetryOnRateLimit checks if an error is a rate limit error during retry attempts.
// If it is, it logs the details and returns true to indicate the caller should stop retrying
// and return immediately, letting the error propagate up to HandleStreamError for proper handling.
// This is used in retry loops to avoid unnecessary retries when rate limited.
func ShouldStopRetryOnRateLimit(ctx context.Context, err error, attempt int, path string) bool {
	if !esiratelimiter.IsRateLimitError(err) {
		return false
	}

	rateLimitErr := esiratelimiter.GetRateLimitError(err)
	logs.DebugCtx(ctx, "rate limit error detected in stream function, returning for asynq retry",
		"attempt", attempt,
		"retryable", rateLimitErr.Retryable,
		"retry_after", rateLimitErr.RetryAfter,
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"token_used", rateLimitErr.TokenUsed,
		"token_limit", rateLimitErr.TokenLimit,
		"estimated_tokens", rateLimitErr.EstimatedTokens,
		"path", path)

	// Always return true for rate limit errors - let asynq handle retries
	return true
}
