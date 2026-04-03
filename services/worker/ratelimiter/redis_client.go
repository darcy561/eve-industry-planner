package ratelimiter

import (
	"context"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/shared/shared/httpclient"
	"eve-industry-planner/shared/shared/logs"

	"github.com/redis/go-redis/v9"
)

// RedisESIClient manages API requests with Redis-based distributed rate limiting
type RedisESIClient struct {
	httpClient *http.Client
	baseURL    string
	redis      *redis.Client
	// Default rate limit (req/s) for groups without token restrictions
	defaultRateLimit float64
	// Window duration for token bucket (15 minutes)
	windowDuration time.Duration
	// TTL for Redis keys (prevents key buildup)
	keyTTL time.Duration
}

// NewRedisESIClient creates a new Redis-based ESI client
func NewRedisESIClient(baseURL string, redisClient *redis.Client, defaultRateLimit float64) *RedisESIClient {
	return &RedisESIClient{
		httpClient: &http.Client{
			Transport: tunedTransport(),
			Timeout:   30 * time.Second,
		},
		baseURL:          baseURL,
		redis:            redisClient,
		defaultRateLimit: defaultRateLimit,
		windowDuration:   15 * time.Minute,
		keyTTL:           60 * time.Minute, // 1 hour TTL for rate limiter keys
	}
}

// isInDowntime checks if current time is during EVE Online daily downtime (UTC 11:00-11:15)
// Returns true and downtime end time if in downtime, false otherwise
func (c *RedisESIClient) isInDowntime(now time.Time) (bool, time.Time) {
	utc := now.UTC()
	hour := utc.Hour()
	minute := utc.Minute()

	// Check if current time is between 11:00 and 11:15 UTC
	if hour == 11 && minute < 15 {
		// We're in downtime window
		// Calculate when downtime ends (11:15 UTC today)
		downtimeEnd := time.Date(utc.Year(), utc.Month(), utc.Day(), 11, 15, 0, 0, time.UTC)
		return true, downtimeEnd
	}

	// Also handle edge case: if it's 11:15 exactly, we might still be in downtime
	// Add small buffer (11:16) to be safe
	if hour == 11 && minute == 15 {
		downtimeEnd := time.Date(utc.Year(), utc.Month(), utc.Day(), 11, 16, 0, 0, time.UTC)
		return true, downtimeEnd
	}

	return false, time.Time{}
}

// checkAndReserve checks token bucket and rate limiter in Redis
// Returns (allowed, waitUntil, error)
func (c *RedisESIClient) checkAndReserve(ctx context.Context, group string, estimatedTokens int, tokenLimit int, rateLimit float64) (bool, time.Time, error) {
	// Build Redis keys
	tokensZSetKey := fmt.Sprintf("esi:group:%s:tokens:zset", group)
	tokensSumKey := fmt.Sprintf("esi:group:%s:tokens:sum", group)
	nextAllowedKey := fmt.Sprintf("esi:group:%s:rate:next_allowed", group)

	// Prepare script arguments
	windowDurationSec := int(c.windowDuration.Seconds())
	// Use -1 if no token restrictions, otherwise use tokenLimit
	tokenLimitArg := tokenLimit
	if tokenLimit <= 0 {
		tokenLimitArg = -1
	}

	// Execute Lua script
	result, err := c.redis.Eval(ctx, CheckAndReserveScript, []string{
		tokensZSetKey,
		tokensSumKey,
		nextAllowedKey,
	}, windowDurationSec, tokenLimitArg, rateLimit).Result()
	if err != nil {
		return false, time.Time{}, fmt.Errorf("redis checkAndReserve failed: %w", err)
	}

	// Parse result: {allowed, wait_until}
	resultArray, ok := result.([]interface{})
	if !ok || len(resultArray) != 2 {
		return false, time.Time{}, fmt.Errorf("invalid result from checkAndReserve script: %v", result)
	}

	allowed := resultArray[0].(int64) == 1

	// Handle both int64 and float64 from Redis (Redis may return integers for whole numbers)
	var waitUntilSec float64
	switch v := resultArray[1].(type) {
	case int64:
		waitUntilSec = float64(v)
	case float64:
		waitUntilSec = v
	default:
		return false, time.Time{}, fmt.Errorf("invalid wait_until type from checkAndReserve script: %T", resultArray[1])
	}

	waitUntil := time.Unix(int64(waitUntilSec), int64((waitUntilSec-float64(int64(waitUntilSec)))*1e9))

	// Ensure waitUntil is always at least 50ms in the future
	// This prevents negative wait times due to timing precision issues
	now := time.Now()
	minWaitUntil := now.Add(50 * time.Millisecond)
	if waitUntil.Before(minWaitUntil) {
		waitUntil = minWaitUntil
	}

	// Set TTL on keys (refresh on each access)
	// Always ensure TTLs are present so stale groups naturally expire, even when:
	// - the current check is not allowed, or
	// - the group has no explicit tokenLimit (tokenLimitArg <= 0).
	//
	// This prevents orphaned child keys (e.g. tokens:zset / tokens:sum) from
	// remaining indefinitely once a group stops receiving traffic.
	c.redis.Expire(ctx, nextAllowedKey, c.keyTTL)
	c.redis.Expire(ctx, tokensZSetKey, 30*time.Minute)
	c.redis.Expire(ctx, tokensSumKey, 30*time.Minute)

	return allowed, waitUntil, nil
}

// snapshotGroupTokenUsed reads esi:group:{group}:tokens:sum for logging. Returns -1 if missing/error.
func (c *RedisESIClient) snapshotGroupTokenUsed(ctx context.Context, group string) int {
	if c.redis == nil {
		return -1
	}
	key := fmt.Sprintf("esi:group:%s:tokens:sum", group)
	v, err := c.redis.Get(ctx, key).Float64()
	if err != nil {
		return -1
	}
	return int(math.Round(v))
}

const (
	// rateLimitMaxBlockWait is the longest we block in-process before yielding with
	// RateLimitError so asynq can re-queue (avoids tying up a worker slot).
	rateLimitMaxBlockWait = 2 * time.Second
	// rateLimitDeadlineReserve stays under the task context deadline so checks/redis work remain possible.
	rateLimitDeadlineReserve = 300 * time.Millisecond
)

// waitUntilRateLimiterAllowed runs the check/wait loop until checkAndReserve allows,
// or returns RateLimitError for asynq to retry. Waits are capped by rateLimitMaxBlockWait
// and by remaining time on ctx (e.g. asynq task timeout) so multi-page work does not
// burn the whole budget in the limiter loop.
func (c *RedisESIClient) waitUntilRateLimiterAllowed(
	ctx context.Context,
	path string,
	groupName string,
	estimatedTokens int,
	tokenLimit int,
	rateLimit float64,
	streaming bool,
) error {
	allowed, waitUntil, err := c.checkAndReserve(ctx, groupName, estimatedTokens, tokenLimit, rateLimit)
	if err != nil {
		if streaming {
			logs.Error("checkAndReserve failed (streaming)", "path", path, "group", groupName, "error", err)
		} else {
			logs.Error("checkAndReserve failed", "path", path, "group", groupName, "error", err)
		}
		return err
	}

	for !allowed {
		waitTime := time.Until(waitUntil)
		if waitTime <= 0 {
			allowed, waitUntil, err = c.checkAndReserve(ctx, groupName, estimatedTokens, tokenLimit, rateLimit)
			if err != nil {
				return err
			}
			if allowed {
				return nil
			}
			waitTime = time.Until(waitUntil)
		}

		maxBlock := rateLimitMaxBlockWait
		if dl, ok := ctx.Deadline(); ok {
			budget := time.Until(dl) - rateLimitDeadlineReserve
			if budget <= 0 {
				logs.Debug("rate limit wait skipped: task context deadline too tight",
					"path", path, "group", groupName, "streaming", streaming)
				tu := -1
				if tokenLimit > 0 {
					tu = c.snapshotGroupTokenUsed(ctx, groupName)
				}
				return &RateLimitError{
					Retryable:       true,
					RetryAfter:      waitUntil,
					Kind:            RateLimitKindTaskBudget,
					Reason:          "task has no time left to wait for the next ESI rate slot; will retry",
					Group:           groupName,
					TokenUsed:       tu,
					TokenLimit:      tokenLimit,
					EstimatedTokens: estimatedTokens,
				}
			}
			if budget < maxBlock {
				maxBlock = budget
			}
		}

		if waitTime > maxBlock {
			if streaming {
				logs.Debug("rate limit wait exceeds cap or task budget, returning to queue for retry (streaming)",
					"path", path, "group", groupName, "wait_time", waitTime, "max_block", maxBlock, "wait_until", waitUntil)
			} else {
				logs.Debug("rate limit wait exceeds cap or task budget, returning to queue for retry",
					"path", path, "group", groupName, "wait_time", waitTime, "max_block", maxBlock, "wait_until", waitUntil)
			}
			tu := -1
			if tokenLimit > 0 {
				tu = c.snapshotGroupTokenUsed(ctx, groupName)
			}
			kind := RateLimitKindClientYield
			reason := fmt.Sprintf(
				"next ESI rate slot is ~%s away; worker yields after %s so task can re-queue (spacing/token window, not necessarily 429)",
				waitTime.Round(time.Millisecond), maxBlock.Round(time.Millisecond))
			if maxBlock < rateLimitMaxBlockWait {
				kind = RateLimitKindTaskBudget
				reason = fmt.Sprintf(
					"next ESI rate slot is ~%s away but only ~%s remains on task deadline; re-queueing",
					waitTime.Round(time.Millisecond), maxBlock.Round(time.Millisecond))
			}
			return &RateLimitError{
				Retryable:       true,
				RetryAfter:      waitUntil,
				Kind:            kind,
				Reason:          reason,
				Group:           groupName,
				TokenUsed:       tu,
				TokenLimit:      tokenLimit,
				EstimatedTokens: estimatedTokens,
			}
		}

		if streaming {
			logs.Debug("rate limit check failed, blocking and waiting (streaming)",
				"path", path, "group", groupName, "wait_until", waitUntil, "wait_time", waitTime)
		} else {
			logs.Debug("rate limit check failed, blocking and waiting",
				"path", path, "group", groupName, "wait_until", waitUntil, "wait_time", waitTime)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(waitTime):
			allowed, waitUntil, err = c.checkAndReserve(ctx, groupName, estimatedTokens, tokenLimit, rateLimit)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

// updateTokens updates token bucket in Redis after request completes
func (c *RedisESIClient) updateTokens(ctx context.Context, group string, path string, actualTokens int, tokenLimit int) error {
	// Build Redis keys
	tokensZSetKey := fmt.Sprintf("esi:group:%s:tokens:zset", group)
	tokensSumKey := fmt.Sprintf("esi:group:%s:tokens:sum", group)
	pathGroupKey := fmt.Sprintf("esi:path:%s:group", path)

	// Use -1 if no token restrictions, otherwise use tokenLimit
	tokenLimitArg := tokenLimit
	if tokenLimit <= 0 {
		tokenLimitArg = -1
	}

	// Execute Lua script
	_, err := c.redis.Eval(ctx, UpdateTokensScript, []string{
		tokensZSetKey,
		tokensSumKey,
		pathGroupKey,
	}, actualTokens, group, tokenLimitArg).Result()
	if err != nil {
		return fmt.Errorf("redis updateTokens failed: %w", err)
	}

	// Set TTLs on keys
	// Always apply TTLs so that group-specific keys are eventually cleaned up,
	// even for groups without explicit token limits.
	c.redis.Expire(ctx, tokensZSetKey, 30*time.Minute)
	c.redis.Expire(ctx, tokensSumKey, 30*time.Minute)
	c.redis.Expire(ctx, pathGroupKey, 24*time.Hour)
	c.redis.Expire(ctx, fmt.Sprintf("esi:group:%s:token_limit", group), 24*time.Hour)

	return nil
}

// getTokenLimitFromRedis retrieves token limit for a group from Redis
// Returns -1 if not found or no token restrictions
func (c *RedisESIClient) getTokenLimitFromRedis(ctx context.Context, group string) int {
	key := fmt.Sprintf("esi:group:%s:token_limit", group)
	val, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return -1 // Not found, assume no token restrictions
	}
	if err != nil {
		logs.Debug("failed to get token limit from redis", "group", group, "error", err)
		return -1
	}
	tokenLimit, err := strconv.Atoi(val)
	if err != nil {
		logs.Debug("failed to parse token limit from redis", "group", group, "value", val, "error", err)
		return -1
	}
	return tokenLimit
}

// getRateLimitFromRedis retrieves rate limit (req/s) for a primary group from Redis
// Returns 0 if not found (will use default)
func (c *RedisESIClient) getRateLimitFromRedis(ctx context.Context, primaryGroup string) float64 {
	key := fmt.Sprintf("esi:primary_group:%s:rate_limit", primaryGroup)
	val, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return 0 // Not found, will use default
	}
	if err != nil {
		logs.Debug("failed to get rate limit from redis", "primary_group", primaryGroup, "error", err)
		return 0
	}
	rateLimit, err := strconv.ParseFloat(val, 64)
	if err != nil {
		logs.Debug("failed to parse rate limit from redis", "primary_group", primaryGroup, "value", val, "error", err)
		return 0
	}
	return rateLimit
}

// setRateLimitInRedis stores rate limit (req/s) for a primary group in Redis
func (c *RedisESIClient) setRateLimitInRedis(ctx context.Context, primaryGroup string, rateLimit float64) {
	key := fmt.Sprintf("esi:primary_group:%s:rate_limit", primaryGroup)
	val := strconv.FormatFloat(rateLimit, 'f', -1, 64)
	if err := c.redis.Set(ctx, key, val, 24*time.Hour).Err(); err != nil {
		logs.Debug("failed to set rate limit in redis", "primary_group", primaryGroup, "rate_limit", rateLimit, "error", err)
	}
}

// getGroupFromPath retrieves group name for a path from Redis
func (c *RedisESIClient) getGroupFromPath(ctx context.Context, path string) (string, bool) {
	key := fmt.Sprintf("esi:path:%s:group", path)
	val, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", false
	}
	if err != nil {
		logs.Debug("failed to get group from path", "path", path, "error", err)
		return "", false
	}
	return val, true
}

// Do performs a rate-limited HTTP request and returns the response body, response, and error.
func (c *RedisESIClient) Do(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) ([]byte, *http.Response, error) {
	groupName := buildGroupNameFromDesignation(groupDesignation)
	logs.Debug("ESI request initiated",
		"method", method,
		"path", path,
		"group_name", groupName,
		"primary_group", groupDesignation.PrimaryGroup,
		"secondary_group", groupDesignation.SecondaryGroup)

	// Check downtime BEFORE any Redis calls
	now := time.Now()
	inDowntime, downtimeEnd := c.isInDowntime(now)
	if inDowntime {
		waitTime := time.Until(downtimeEnd)
		logs.Debug("request blocked during EVE downtime",
			"path", path,
			"downtime_end", downtimeEnd,
			"wait_time", waitTime)
		return nil, nil, &RateLimitError{
			Retryable:       true,
			RetryAfter:      downtimeEnd,
			Reason:          "EVE Online daily downtime (UTC 11:00-11:15)",
			Group:           groupName,
			TokenUsed:       0,
			TokenLimit:      0,
			EstimatedTokens: 2,
		}
	}

	// Get token limit from Redis (or use -1 if not found)
	tokenLimit := c.getTokenLimitFromRedis(ctx, groupName)
	if tokenLimit < 0 {
		// Not found or no token restrictions - use default rate limit only
		tokenLimit = -1
	}

	// Get rate limit for this primary group from Redis (or use default)
	rateLimit := c.getRateLimitFromRedis(ctx, groupDesignation.PrimaryGroup)
	if rateLimit == 0 {
		// Not found, use default rate limit
		rateLimit = c.defaultRateLimit
	}

	// Estimate tokens needed (assume 2XX response = 2 tokens for now)
	estimatedTokens := 2

	// Add small random jitter before first rate limit check to spread out Redis calls
	// This prevents thundering herd when many tasks start simultaneously (e.g., cron job submissions)
	// Jitter of 0-100ms spreads load over a small window, reducing CPU spikes
	jitter := time.Duration(rand.Intn(100)) * time.Millisecond
	select {
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	case <-time.After(jitter):
		// Jitter complete, proceed with rate limit check
	}

	if err := c.waitUntilRateLimiterAllowed(ctx, path, groupName, estimatedTokens, tokenLimit, rateLimit, false); err != nil {
		return nil, nil, err
	}

	// Make HTTP request
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, nil)
	if err != nil {
		return nil, nil, err
	}

	// Apply default headers
	httpclient.ApplyDefaultHeaders(req)

	// Apply custom headers
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	requestStart := time.Now()
	resp, err := c.httpClient.Do(req)
	requestDuration := time.Since(requestStart)
	if err != nil {
		logs.Error("HTTP request failed",
			"path", path,
			"group", groupName,
			"error", err,
			"duration", requestDuration)
		return nil, nil, err
	}

	// Calculate actual tokens consumed
	tokensConsumed := getTokensForStatus(resp.StatusCode)
	logs.Debug("ESI response received",
		"path", path,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"duration", requestDuration,
		"group", groupName,
		"content_length", resp.ContentLength)

	// Parse response headers to update token limit
	limitStr := resp.Header.Get("X-Ratelimit-Limit")
	if limitStr != "" {
		if parsedLimit, ok := parseTokenLimitFromHeader(limitStr); ok {
			tokenLimit = parsedLimit
		}
	}

	// Update tokens in Redis
	if err := c.updateTokens(ctx, groupName, path, tokensConsumed, tokenLimit); err != nil {
		logs.Error("updateTokens failed", "path", path, "group", groupName, "error", err)
		// Don't fail the request, just log the error
	}

	// Store rate limit for primary group if we have a configured rate limit
	// This allows per-primary-group rate limits to be configured and persisted
	// Note: We don't parse rate limits from headers as ESI doesn't provide this,
	// but we can set them programmatically or via configuration

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		resp.Body.Close()
		return nil, resp, err
	}

	// Handle 429 responses
	if resp.StatusCode == http.StatusTooManyRequests {
		resp.Body.Close()
		retryAfterStr := resp.Header.Get("Retry-After")
		retryAfterTime := time.Now().Add(15 * time.Minute) // Default to window duration
		retryable := false

		if retryAfterStr != "" {
			if seconds, err := strconv.Atoi(retryAfterStr); err == nil {
				retryAfterTime = time.Now().Add(time.Duration(seconds) * time.Second)
				retryable = true
			}
		}

		err := &RateLimitError{
			Retryable:       retryable,
			RetryAfter:      retryAfterTime,
			Reason:          "server returned 429 Too Many Requests",
			Group:           groupName,
			TokenUsed:       0,
			TokenLimit:      tokenLimit,
			EstimatedTokens: tokensConsumed,
		}

		logs.Warn("received 429, returning classified error for task handling",
			"path", path,
			"group", groupName,
			"retryable", retryable,
			"retry_after", retryAfterTime,
			"retry_after_seconds", retryAfterStr)

		return nil, resp, err
	}

	logs.Info("ESI request completed successfully",
		"path", path,
		"group", groupName,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"token_limit", tokenLimit,
		"body_size", len(body))

	return body, resp, nil
}

// DoRequest performs a rate-limited HTTP request and returns just the response.
// This is useful when you need full control over reading the response body (e.g., for streaming).
func (c *RedisESIClient) DoRequest(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) (*http.Response, error) {
	groupName := buildGroupNameFromDesignation(groupDesignation)
	logs.Debug("ESI request initiated (streaming)",
		"method", method,
		"path", path,
		"group_name", groupName,
		"primary_group", groupDesignation.PrimaryGroup,
		"secondary_group", groupDesignation.SecondaryGroup)

	// Check downtime BEFORE any Redis calls
	now := time.Now()
	inDowntime, downtimeEnd := c.isInDowntime(now)
	if inDowntime {
		waitTime := time.Until(downtimeEnd)
		logs.Debug("request blocked during EVE downtime (streaming)",
			"path", path,
			"downtime_end", downtimeEnd,
			"wait_time", waitTime)
		return nil, &RateLimitError{
			Retryable:       true,
			RetryAfter:      downtimeEnd,
			Reason:          "EVE Online daily downtime (UTC 11:00-11:15)",
			Group:           groupName,
			TokenUsed:       0,
			TokenLimit:      0,
			EstimatedTokens: 2,
		}
	}

	// Get token limit from Redis (or use -1 if not found)
	tokenLimit := c.getTokenLimitFromRedis(ctx, groupName)
	if tokenLimit < 0 {
		tokenLimit = -1
	}

	// Get rate limit for this primary group from Redis (or use default)
	rateLimit := c.getRateLimitFromRedis(ctx, groupDesignation.PrimaryGroup)
	if rateLimit == 0 {
		// Not found, use default rate limit
		rateLimit = c.defaultRateLimit
	}

	// Estimate tokens needed
	estimatedTokens := 2

	// Add small random jitter before first rate limit check to spread out Redis calls
	// This prevents thundering herd when many tasks start simultaneously (e.g., cron job submissions)
	// Jitter of 0-100ms spreads load over a small window, reducing CPU spikes
	jitter := time.Duration(rand.Intn(100)) * time.Millisecond
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(jitter):
		// Jitter complete, proceed with rate limit check
	}

	if err := c.waitUntilRateLimiterAllowed(ctx, path, groupName, estimatedTokens, tokenLimit, rateLimit, true); err != nil {
		return nil, err
	}

	// Make HTTP request
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}

	// Apply default headers
	httpclient.ApplyDefaultHeaders(req)

	// Apply custom headers
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	requestStart := time.Now()
	resp, err := c.httpClient.Do(req)
	requestDuration := time.Since(requestStart)
	if err != nil {
		logs.Error("HTTP request failed (streaming)",
			"path", path,
			"group", groupName,
			"error", err,
			"duration", requestDuration)
		return nil, err
	}

	// Calculate actual tokens consumed
	tokensConsumed := getTokensForStatus(resp.StatusCode)
	logs.Debug("ESI response received (streaming)",
		"path", path,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"duration", requestDuration,
		"group", groupName,
		"content_length", resp.ContentLength)

	// Parse response headers to update token limit
	limitStr := resp.Header.Get("X-Ratelimit-Limit")
	if limitStr != "" {
		if parsedLimit, ok := parseTokenLimitFromHeader(limitStr); ok {
			tokenLimit = parsedLimit
		}
	}

	// Update tokens in Redis
	if err := c.updateTokens(ctx, groupName, path, tokensConsumed, tokenLimit); err != nil {
		logs.Error("updateTokens failed (streaming)", "path", path, "group", groupName, "error", err)
		// Don't fail the request, just log the error
	}

	// Handle 429 responses
	if resp.StatusCode == http.StatusTooManyRequests {
		resp.Body.Close()
		retryAfterStr := resp.Header.Get("Retry-After")
		retryAfterTime := time.Now().Add(15 * time.Minute)
		retryable := false

		if retryAfterStr != "" {
			if seconds, err := strconv.Atoi(retryAfterStr); err == nil {
				retryAfterTime = time.Now().Add(time.Duration(seconds) * time.Second)
				retryable = true
			}
		}

		err := &RateLimitError{
			Retryable:       retryable,
			RetryAfter:      retryAfterTime,
			Reason:          "server returned 429 Too Many Requests",
			Group:           groupName,
			TokenUsed:       0,
			TokenLimit:      tokenLimit,
			EstimatedTokens: tokensConsumed,
		}

		logs.Warn("received 429, returning classified error for task handling (streaming)",
			"path", path,
			"group", groupName,
			"retryable", retryable,
			"retry_after", retryAfterTime,
			"retry_after_seconds", retryAfterStr)

		return nil, err
	}

	logs.Debug("ESI request completed (streaming response)",
		"path", path,
		"group", groupName,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"token_limit", tokenLimit)

	return resp, nil
}

// SetPrimaryGroupRateLimit sets the rate limit (req/s) for a primary group
// This allows different primary groups to have different rate limits
// Example: market-order group could have 5 req/s, while industry has 3 req/s
func (c *RedisESIClient) SetPrimaryGroupRateLimit(ctx context.Context, primaryGroup string, rateLimit float64) error {
	if rateLimit <= 0 {
		return fmt.Errorf("rate limit must be greater than 0, got %f", rateLimit)
	}
	c.setRateLimitInRedis(ctx, primaryGroup, rateLimit)
	logs.Info("set primary group rate limit", "primary_group", primaryGroup, "rate_limit", rateLimit)
	return nil
}

// GetPrimaryGroupRateLimit retrieves the configured rate limit for a primary group
// Returns the configured rate limit or 0 if not set (will use default)
func (c *RedisESIClient) GetPrimaryGroupRateLimit(ctx context.Context, primaryGroup string) float64 {
	return c.getRateLimitFromRedis(ctx, primaryGroup)
}

// InitializeDefaultRateLimits sets rate limits for all primary groups, overwriting any existing values
// This should be called on startup to ensure rate limits are configured and to apply configuration changes
func (c *RedisESIClient) InitializeDefaultRateLimits(ctx context.Context, rateLimits map[string]float64) error {
	for primaryGroup, rateLimit := range rateLimits {
		if err := c.SetPrimaryGroupRateLimit(ctx, primaryGroup, rateLimit); err != nil {
			return fmt.Errorf("failed to initialize rate limit for %s: %w", primaryGroup, err)
		}
	}
	return nil
}
