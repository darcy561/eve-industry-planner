package esi

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
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

// HandleStatusCheckResult handles the result of a server status check, returning true if processing should continue.
// Returns false if the status check failed and the caller should exit early.
// taskName is used for logging purposes (e.g., "system indexes refresh", "adjusted prices refresh").
func HandleStatusCheckResult(statusResult esicore.StatusResult, natsMessage MessageInterface, taskName string, deliveryCount uint64) bool {
	if statusResult.Available {
		logs.Debug("server status check passed, proceeding with refresh",
			"cached", statusResult.Cached,
			"task", taskName,
			"delivery_count", deliveryCount)
		return true
	}

	// Server not available - handle errors
	if statusResult.Error != nil {
		if esiratelimiter.IsRateLimitError(statusResult.Error) {
			return handleStatusCheckRateLimit(statusResult.Error, natsMessage, taskName, deliveryCount)
		}
		// Other error - server unavailable
		handleStatusCheckError(statusResult.Error, natsMessage, taskName, deliveryCount)
		return false
	}

	// Available is false but no error - shouldn't happen, but handle gracefully
	logs.Warn("server status check indicates servers unavailable, acknowledging message",
		"task", taskName,
		"delivery_count", deliveryCount)
	acknowledgeMessage(natsMessage, "server unavailable", deliveryCount)
	return false
}

// handleStatusCheckRateLimit handles rate limit errors from status check.
// Returns true if retryable and should continue (shouldn't happen), false otherwise.
func handleStatusCheckRateLimit(err error, natsMessage MessageInterface, taskName string, deliveryCount uint64) bool {
	rateLimitErr := esiratelimiter.GetRateLimitError(err)
	logs.Info("server status check rate limited, delaying refresh",
		"retryable", rateLimitErr.Retryable,
		"retry_after", rateLimitErr.RetryAfter,
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"task", taskName,
		"delivery_count", deliveryCount)

	if esiratelimiter.IsRetryableRateLimitError(err) {
		return handleRetryableRateLimit(natsMessage, rateLimitErr, taskName, deliveryCount)
	}

	// Non-retryable rate limit error
	logs.Warn("server status check rate limit error is NOT retryable, acknowledging message",
		"reason", rateLimitErr.Reason,
		"task", taskName,
		"delivery_count", deliveryCount)
	acknowledgeMessage(natsMessage, "non-retryable rate limit", deliveryCount)
	return false
}

// handleRetryableRateLimit handles retryable rate limit errors by scheduling delayed redelivery.
// Returns false since we're exiting early.
func handleRetryableRateLimit(natsMessage MessageInterface, rateLimitErr *esiratelimiter.RateLimitError, taskName string, deliveryCount uint64) bool {
	if natsMessage != nil {
		waitDuration := time.Until(rateLimitErr.RetryAfter)
		if waitDuration > 0 {
			logs.Info("refresh delayed due to status check rate limit, delaying redelivery",
				"retry_after", rateLimitErr.RetryAfter,
				"wait_duration", waitDuration,
				"task", taskName,
				"delivery_count", deliveryCount)
			if nakErr := natsMessage.NakWithDelay(waitDuration); nakErr != nil {
				logs.Error("failed to nack with delay, falling back to normal nack",
					"nak_error", nakErr,
					"task", taskName,
					"delivery_count", deliveryCount)
				natscore.NackWithBackoff(natsMessage)
			}
			return false
		}
	}
	natscore.NackWithBackoff(natsMessage)
	return false
}

// handleStatusCheckError handles non-rate-limit errors from status check.
func handleStatusCheckError(err error, natsMessage MessageInterface, taskName string, deliveryCount uint64) {
	logs.Warn("server status check failed, servers may be unavailable, acknowledging message",
		"error", err,
		"task", taskName,
		"delivery_count", deliveryCount)
	acknowledgeMessage(natsMessage, "server unavailable", deliveryCount)
}

// acknowledgeMessage acknowledges a NATS message with appropriate logging.
func acknowledgeMessage(natsMessage MessageInterface, reason string, deliveryCount uint64) {
	if natsMessage != nil {
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message after status check", "error", ackErr, "reason", reason)
		} else {
			logs.Info("message acknowledged", "reason", reason, "delivery_count", deliveryCount)
		}
	}
}

// HandleStreamError handles errors from ESI streaming operations, including rate limit errors.
// If the error is a rate limit error, it handles delayed redelivery for retryable errors or nacks for non-retryable.
// For other errors, it logs them as stream errors and increments the error metrics.
// The function always causes the caller to exit (returns), so it should be called before the success path.
// taskName is used for logging (e.g., "system indexes refresh", "adjusted prices refresh").
// errorCounterVec should be the Errors field from the metrics struct (e.g., metrics.GetESIIndustrySystems().Errors).
func HandleStreamError(err error, natsMessage MessageInterface, taskName string, deliveryCount uint64, errorCounterVec *metrics.CounterVec) {
	if err == nil {
		return
	}

	logs.Debug("stream error returned", "error", err, "error_type", fmt.Sprintf("%T", err), "task", taskName, "delivery_count", deliveryCount)

	// Check if this is a rate limit error
	if esiratelimiter.IsRateLimitError(err) {
		handleStreamRateLimitError(err, natsMessage, taskName, deliveryCount)
		return
	}

	// Handle non-rate-limit stream errors
	logs.Error("failed streaming ESI data, nacking with backoff",
		"error", err,
		"error_type", fmt.Sprintf("%T", err),
		"reason", "stream_error",
		"task", taskName,
		"delivery_count", deliveryCount)
	if natsMessage != nil {
		natscore.NackWithBackoff(natsMessage)
	}
	if errorCounterVec != nil {
		errorCounterVec.WithLabelValues("stream").Inc()
	}
}

// ShouldStopRetryOnRateLimit checks if an error is a rate limit error during retry attempts.
// If it is, it logs the details and returns true to indicate the caller should stop retrying
// and return immediately, letting the error propagate up to HandleStreamError for proper handling.
// This is used in retry loops to avoid unnecessary retries when rate limited.
func ShouldStopRetryOnRateLimit(err error, attempt int, path string) bool {
	if !esiratelimiter.IsRateLimitError(err) {
		return false
	}

	rateLimitErr := esiratelimiter.GetRateLimitError(err)
	logs.Info("rate limit error detected in stream function, returning for NATS redelivery",
		"attempt", attempt,
		"retryable", rateLimitErr.Retryable,
		"retry_after", rateLimitErr.RetryAfter,
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"token_used", rateLimitErr.TokenUsed,
		"token_limit", rateLimitErr.TokenLimit,
		"estimated_tokens", rateLimitErr.EstimatedTokens,
		"path", path)

	if esiratelimiter.IsRetryableRateLimitError(err) {
		logs.Debug("rate limit error is retryable, returning error for caller to handle redelivery", "path", path)
		return true
	}

	logs.Warn("rate limit error is NOT retryable, returning error anyway", "path", path, "reason", rateLimitErr.Reason)
	return true
}

// handleStreamRateLimitError handles rate limit errors from ESI streaming operations.
func handleStreamRateLimitError(err error, natsMessage MessageInterface, taskName string, deliveryCount uint64) {
	rateLimitErr := esiratelimiter.GetRateLimitError(err)
	logs.Info("detected rate limit error in refresh", "error", err, "task", taskName, "delivery_count", deliveryCount)

	logs.Debug("rate limit error details",
		"retryable", rateLimitErr.Retryable,
		"retry_after", rateLimitErr.RetryAfter,
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"token_used", rateLimitErr.TokenUsed,
		"token_limit", rateLimitErr.TokenLimit,
		"estimated_tokens", rateLimitErr.EstimatedTokens,
		"task", taskName,
		"delivery_count", deliveryCount)

	if esiratelimiter.IsRetryableRateLimitError(err) {
		handleStreamRetryableRateLimit(natsMessage, rateLimitErr, taskName, deliveryCount)
		return
	}

	// Non-retryable rate limit error
	logs.Warn("rate limit error is NOT retryable, using normal nack backoff",
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"task", taskName,
		"delivery_count", deliveryCount)
	if natsMessage != nil {
		natscore.NackWithBackoff(natsMessage)
	}
}

// handleStreamRetryableRateLimit handles retryable rate limit errors from streaming operations.
func handleStreamRetryableRateLimit(natsMessage MessageInterface, rateLimitErr *esiratelimiter.RateLimitError, taskName string, deliveryCount uint64) {
	logs.Info("rate limit error is retryable, attempting NATS redelivery", "task", taskName, "delivery_count", deliveryCount)
	if natsMessage == nil {
		logs.Warn("rate limit error is retryable but natsMessage is nil, cannot delay redelivery",
			"task", taskName,
			"delivery_count", deliveryCount)
		return
	}

	waitDuration := time.Until(rateLimitErr.RetryAfter)
	now := time.Now()

	logs.Debug("calculating wait duration for redelivery",
		"now", now,
		"retry_after", rateLimitErr.RetryAfter,
		"wait_duration", waitDuration,
		"wait_duration_seconds", waitDuration.Seconds(),
		"task", taskName,
		"delivery_count", deliveryCount)

	if waitDuration <= 0 {
		logs.Warn("wait duration is <= 0, cannot delay redelivery, falling back to normal nack",
			"wait_duration", waitDuration,
			"retry_after", rateLimitErr.RetryAfter,
			"now", now,
			"task", taskName,
			"delivery_count", deliveryCount)
		natscore.NackWithBackoff(natsMessage)
		return
	}

	logs.Info("refresh rate limited, delaying redelivery",
		"retry_after", rateLimitErr.RetryAfter,
		"wait_duration", waitDuration,
		"wait_duration_seconds", waitDuration.Seconds(),
		"wait_duration_minutes", waitDuration.Minutes(),
		"reason", rateLimitErr.Reason,
		"group", rateLimitErr.Group,
		"token_used", rateLimitErr.TokenUsed,
		"token_limit", rateLimitErr.TokenLimit,
		"estimated_tokens", rateLimitErr.EstimatedTokens,
		"task", taskName,
		"delivery_count", deliveryCount)

	logs.Debug("calling NakWithDelay", "delay", waitDuration, "task", taskName, "delivery_count", deliveryCount)
	if nakErr := natsMessage.NakWithDelay(waitDuration); nakErr != nil {
		logs.Error("failed to nack with delay, falling back to normal nack",
			"nak_error", nakErr,
			"nak_error_type", fmt.Sprintf("%T", nakErr),
			"requested_delay", waitDuration,
			"task", taskName,
			"delivery_count", deliveryCount)
		logs.Warn("falling back to NackWithBackoff", "task", taskName, "delivery_count", deliveryCount)
		natscore.NackWithBackoff(natsMessage)
	} else {
		logs.Info("successfully called NakWithDelay, message will be redelivered after delay",
			"delay", waitDuration,
			"redelivery_time", rateLimitErr.RetryAfter,
			"task", taskName,
			"delivery_count", deliveryCount)
	}
}
