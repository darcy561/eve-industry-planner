package esi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	esiratelimiter "eve-industry-planner/worker/ratelimiter"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"

	"github.com/redis/go-redis/v9"
)

var (
	// statusCheckCache prevents duplicate concurrent status checks
	// When multiple tasks check status simultaneously, they share the result
	statusCheckCache struct {
		mu       sync.Mutex
		inFlight bool
		result   StatusResult
		cacheTTL time.Duration // TTL from ESI response headers, or fallback
		waiters  []chan StatusResult
	}
	// statusCacheTTLFallback is the fallback TTL if ESI doesn't provide cache headers (15 seconds)
	statusCacheTTLFallback = 15 * time.Second
	lastCheckTime          time.Time
	lastCheckMu            sync.RWMutex
)

// ServerStatusResponse represents the ESI server status response structure
type ServerStatusResponse struct {
	Players       int32  `json:"players"`
	ServerVersion string `json:"server_version"`
	StartTime     string `json:"start_time"`
}

// StatusResult contains the result of a status check, providing enough information
// for calling tasks to decide whether to proceed or exit
type StatusResult struct {
	// Available indicates whether the EVE servers are available and accessible
	Available bool
	// Status contains the server status data if available
	Status *ServerStatusResponse
	// LastUpdated is the timestamp (millis since epoch) when the status was last successfully retrieved
	LastUpdated int64
	// ETag is the ETag from the last successful request
	ETag string
	// Cached indicates whether the data came from cache (304 Not Modified)
	Cached bool
	// Error contains any error that occurred during the request (rate limit, network, etc.)
	Error error
}

// tryRedisSharedStatusCache returns (true, result) if Redis still considers the last
// successful /v1/status/ response fresh (valid_until in the future and body present).
func tryRedisSharedStatusCache(ctx context.Context, redisClient *redis.Client) (bool, StatusResult) {
	validUntil, err := rediscore.GetServerStatusValidUntil(ctx, redisClient)
	if err != nil && err != redis.Nil {
		logs.DebugCtx(ctx,"failed to read server status valid-until from redis", "error", err)
		return false, StatusResult{}
	}
	if validUntil == 0 {
		return false, StatusResult{}
	}
	now := time.Now().UnixMilli()
	if now >= validUntil {
		return false, StatusResult{}
	}

	var cachedStatus ServerStatusResponse
	if err := rediscore.GetServerStatus(ctx, redisClient, &cachedStatus); err != nil {
		return false, StatusResult{}
	}

	lastUpdated, _ := rediscore.GetServerStatusLastUpdated(ctx, redisClient)
	etag, _ := rediscore.GetServerStatusETag(ctx, redisClient)

	return true, StatusResult{
		Available:   true,
		Status:      &cachedStatus,
		LastUpdated: lastUpdated,
		ETag:        etag,
		Cached:      true,
	}
}

// persistStatusValidUntil stores when cached status may be reused without HTTP, from ESI cache headers.
func persistStatusValidUntil(ctx context.Context, redisClient *redis.Client, cacheTTL time.Duration) {
	if redisClient == nil || cacheTTL <= 0 {
		return
	}
	until := time.Now().Add(cacheTTL).UnixMilli()
	if err := rediscore.SaveServerStatusValidUntil(ctx, redisClient, until); err != nil {
		logs.WarnCtx(ctx,"failed to save server status valid-until to redis", "error", err)
	}
}

// CheckServerStatus queries the ESI /v1/status/ endpoint to check if EVE servers are available.
// It uses the provided ESI rate limiter and Redis for caching with ETag support.
// If multiple goroutines call this simultaneously, they will share a single request result.
// Returns a StatusResult with enough information for callers to handle or exit as needed.
func CheckServerStatus(ctx context.Context, esiClient esiratelimiter.ClientInterface, redisClient *redis.Client) StatusResult {
	// Redis shared gate: skip HTTP while valid_until is in the future (any worker can set it).
	if redisClient != nil {
		if ok, res := tryRedisSharedStatusCache(ctx, redisClient); ok {
			validUntil, _ := rediscore.GetServerStatusValidUntil(ctx, redisClient)
			secLeft := int((validUntil - time.Now().UnixMilli()) / 1000)
			if secLeft < 0 {
				secLeft = 0
			}
			logs.DebugCtx(ctx,"server status from shared Redis cache (no HTTP)",
				"valid_until_ms", validUntil,
				"seconds_left", secLeft)
			return res
		}
	}

	// Check if we have a recent cached result (within TTL)
	lastCheckMu.RLock()
	timeSinceLastCheck := time.Since(lastCheckTime)
	lastCheckMu.RUnlock()

	statusCheckCache.mu.Lock()
	// If there's an in-flight request, wait for it to complete
	if statusCheckCache.inFlight {
		// Create a channel to receive the result
		resultChan := make(chan StatusResult, 1)
		statusCheckCache.waiters = append(statusCheckCache.waiters, resultChan)
		statusCheckCache.mu.Unlock()

		logs.DebugCtx(ctx,"status check already in flight, waiting for result")
		// Wait for the result or context timeout
		select {
		case result := <-resultChan:
			return result
		case <-ctx.Done():
			return StatusResult{Error: ctx.Err()}
		}
	}

	// If we have a recent result (within TTL), return it without making a request
	cacheTTL := statusCheckCache.cacheTTL
	if cacheTTL == 0 {
		cacheTTL = statusCacheTTLFallback
	}
	if timeSinceLastCheck < cacheTTL && statusCheckCache.result.Available {
		result := statusCheckCache.result
		statusCheckCache.mu.Unlock()
		logs.DebugCtx(ctx,"returning cached status check result", "age_seconds", int(timeSinceLastCheck.Seconds()), "ttl_seconds", int(cacheTTL.Seconds()))
		return result
	}

	// Start a new request
	statusCheckCache.inFlight = true
	statusCheckCache.mu.Unlock()

	// Ensure cleanup happens even if checkServerStatusInternal panics
	// This prevents inFlight from staying true forever and blocking all future requests
	var statusResult StatusResult
	var resultCacheTTL time.Duration
	var waitersToNotify []chan StatusResult

	defer func() {
		// Recover from panic to ensure cleanup always happens
		if r := recover(); r != nil {
			logs.ErrorCtx(ctx,"panic in status check, cleaning up", "panic", r)
			statusResult = StatusResult{Error: fmt.Errorf("panic in status check: %v", r)}
		}

		// Update cache and notify waiters (even on panic/error)
		statusCheckCache.mu.Lock()
		statusCheckCache.inFlight = false

		// Only cache successful results (Available = true)
		// Errors should not be cached to allow future requests to retry
		// If we got a valid successful result, update the cache
		if statusResult.Available {
			statusCheckCache.result = statusResult
			statusCheckCache.cacheTTL = resultCacheTTL
		}
		// If there was an error or panic, we don't update the cache
		// This keeps the previous successful result (if any) and allows retries

		waitersToNotify = statusCheckCache.waiters
		statusCheckCache.waiters = nil
		statusCheckCache.mu.Unlock()

		// Update last check time only if we got a successful result
		if statusResult.Available {
			lastCheckMu.Lock()
			lastCheckTime = time.Now()
			lastCheckMu.Unlock()
		}

		// Notify all waiting goroutines (they'll get error result if panic occurred)
		for _, waiter := range waitersToNotify {
			select {
			case waiter <- statusResult:
			default:
			}
		}
	}()

	// Perform the actual status check
	statusResult, resultCacheTTL = checkServerStatusInternal(ctx, esiClient, redisClient)

	return statusResult
}

// parseCacheSeconds extracts max-age seconds from Cache-Control header
// Returns 0 if not found or invalid
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

// checkServerStatusInternal performs the actual ESI status check
// Returns the result and the cache TTL from response headers (or fallback)
func checkServerStatusInternal(ctx context.Context, esiClient esiratelimiter.ClientInterface, redisClient *redis.Client) (StatusResult, time.Duration) {
	result := StatusResult{
		Available: false,
	}

	// Check Redis for cached ETag
	prevETag, err := rediscore.GetServerStatusETag(ctx, redisClient)
	if err != nil && err != redis.Nil {
		// Log but don't fail - we can still make the request without ETag
		logs.DebugCtx(ctx,"failed to retrieve cached ETag, proceeding without it", "error", err)
	}

	// Prepare headers with ETag if available
	headers := map[string]string{
		"Accept":          "application/json",
		"Accept-Encoding": "gzip",
	}
	if prevETag != "" {
		headers["If-None-Match"] = prevETag
	}

	path := "/v1/status/"
	logs.DebugCtx(ctx,"checking ESI server status", "path", path, "etag_provided", prevETag != "")

	// Make rate-limited request
	groupDesignation := esiratelimiter.GroupDesignation{
		PrimaryGroup: "status", // Status endpoint group
	}
	body, resp, err := esiClient.Do(ctx, http.MethodGet, path, headers, groupDesignation)
	if resp != nil {
		defer resp.Body.Close()
	}

	// Handle rate limit errors
	if esiratelimiter.IsRateLimitError(err) {
		rateLimitErr := esiratelimiter.GetRateLimitError(err)
		logs.InfoCtx(ctx,"rate limit error during status check",
			"retryable", rateLimitErr.Retryable,
			"retry_after", rateLimitErr.RetryAfter,
			"reason", rateLimitErr.Reason,
			"group", rateLimitErr.Group)
		result.Error = err
		return result, statusCacheTTLFallback
	}

	// Handle other errors
	if err != nil {
		logs.ErrorCtx(ctx,"failed to check server status", "error", err, "path", path)
		result.Error = err
		return result, statusCacheTTLFallback
	}

	if resp == nil {
		result.Error = errors.New("nil HTTP response")
		return result, statusCacheTTLFallback
	}

	// Extract ETag from response
	newETag := resp.Header.Get("ETag")

	// Parse cache TTL from response headers
	cacheSeconds := parseCacheSeconds(resp)
	cacheTTL := time.Duration(cacheSeconds) * time.Second
	if cacheTTL == 0 {
		cacheTTL = statusCacheTTLFallback
	}

	// Handle 304 Not Modified - server is available, data is cached
	if resp.StatusCode == http.StatusNotModified {

		// Try to load cached status data
		var cachedStatus ServerStatusResponse
		if err := rediscore.GetServerStatus(ctx, redisClient, &cachedStatus); err == nil {
			result.Status = &cachedStatus
		}

		// Get last updated timestamp
		if lastUpdated, err := rediscore.GetServerStatusLastUpdated(ctx, redisClient); err == nil {
			result.LastUpdated = lastUpdated
		}

		result.Available = true
		result.ETag = newETag
		result.Cached = true
		persistStatusValidUntil(ctx, redisClient, cacheTTL)
		return result, cacheTTL
	}

	// Handle non-200 status codes
	if resp.StatusCode != http.StatusOK {
		errorBody := string(body)
		if len(errorBody) > 200 {
			errorBody = errorBody[:200] + "..."
		}
		err := fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, errorBody)
		logs.ErrorCtx(ctx,"server status check returned non-200 status", "status", resp.StatusCode, "body", errorBody)
		result.Error = err
		return result, statusCacheTTLFallback
	}

	// Parse successful response (200 OK)
	var status ServerStatusResponse
	if err := json.Unmarshal(body, &status); err != nil {
		logs.ErrorCtx(ctx,"failed to parse server status response", "error", err, "body_length", len(body))
		result.Error = fmt.Errorf("failed to unmarshal status response: %w", err)
		return result, statusCacheTTLFallback
	}

	// Save to Redis
	now := time.Now().UnixMilli()
	if err := rediscore.SaveServerStatus(ctx, redisClient, &status); err != nil {
		logs.WarnCtx(ctx,"failed to save server status to Redis", "error", err)
		// Don't fail - status check is successful even if cache save fails
	}

	if err := rediscore.SaveServerStatusETag(ctx, redisClient, newETag); err != nil {
		logs.WarnCtx(ctx,"failed to save server status ETag to Redis", "error", err)
		// Don't fail - status check is successful even if cache save fails
	}

	if err := rediscore.SaveServerStatusLastUpdated(ctx, redisClient, now); err != nil {
		logs.WarnCtx(ctx,"failed to save server status last updated to Redis", "error", err)
		// Don't fail - status check is successful even if cache save fails
	}

	logs.DebugCtx(ctx,"server status check successful",
		"players", status.Players,
		"server_version", status.ServerVersion,
		"start_time", status.StartTime,
		"etag", newETag,
		"cache_ttl_seconds", int(cacheTTL.Seconds()))

	result.Available = true
	result.Status = &status
	result.LastUpdated = now
	result.ETag = newETag
	result.Cached = false

	persistStatusValidUntil(ctx, redisClient, cacheTTL)
	return result, cacheTTL
}
