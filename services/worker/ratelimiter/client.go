package ratelimiter

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"eve-industry-planner/shared/shared/httpclient"
	"eve-industry-planner/shared/logs"

	"golang.org/x/time/rate"
)

// NewESIClient initializes the client with a default limiter.
func NewESIClient(baseURL string, defaultRPS float64, burst int) *ESIClient {
	def := &GroupLimiter{
		Limiter:                  rate.NewLimiter(rate.Limit(defaultRPS), burst),
		DefaultRate:              rate.Limit(defaultRPS),
		DefaultBurst:             burst,
		Name:                     "default",
		EnforceTokenRestrictions: false, // Default limiter has no headers, so no token restrictions
		TokenLimit:               0,     // No token tracking for default limiter - only uses rate limiter
		consumptions:             make([]TokenConsumption, 0),
		windowDuration:           15 * time.Minute,
		lastUpdate:               time.Now(),
		lastUsed:                 time.Now(),
	}

	return &ESIClient{
		httpClient: &http.Client{
			Transport: tunedTransport(),
			Timeout:   30 * time.Second,
		},
		baseURL:         baseURL,
		limiters:        make(map[string]*GroupLimiter),
		defLim:          def,
		pathToGroup:     make(map[string]string),
		unknownGroups:   make(map[string]*sync.Mutex),
		cleanupInterval: 1 * time.Hour,  // Run cleanup every hour
		maxIdleTime:     24 * time.Hour, // Remove groups idle for 24 hours
	}
}

// AddGroupLimiter manually registers a limiter for a specific group name (optional, for explicit control).
// Groups are typically discovered automatically from X-Ratelimit-Group headers.
func (c *ESIClient) AddGroupLimiter(groupName string, rps float64, burst int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.limiters[groupName] = &GroupLimiter{
		Limiter:                  rate.NewLimiter(rate.Limit(rps), burst),
		DefaultRate:              rate.Limit(rps),
		DefaultBurst:             burst,
		Name:                     groupName,
		EnforceTokenRestrictions: true, // Manually added limiters should enforce tokens
		TokenLimit:               1000, // Default token limit (will be updated from headers)
		consumptions:             make([]TokenConsumption, 0),
		windowDuration:           15 * time.Minute,
		lastUpdate:               time.Now(),
		lastUsed:                 time.Now(),
	}
	logs.InfoCtx(context.Background(), "manually added group limiter", "group", groupName, "rps", rps, "burst", burst)
}

// updateFromHeaders updates token bucket from ESI rate limit headers.
// If this is a new group discovery, creates the group limiter and maps the path.
// groupDesignation is required and specifies the rate limit group (no longer extracted from headers).
// Character ID should be included in GroupDesignation.SecondaryGroup if needed.
func (c *ESIClient) updateFromHeaders(ctx context.Context, gl *GroupLimiter, resp *http.Response, tokensConsumed int, path string, groupDesignation GroupDesignation) *GroupLimiter {
	now := time.Now()

	// Parse ESI rate limit headers (for token limits and usage, not group name)
	limitStr := resp.Header.Get("X-Ratelimit-Limit")
	remainingStr := resp.Header.Get("X-Ratelimit-Remaining")
	usedStr := resp.Header.Get("X-Ratelimit-Used")

	// Build group name from provided designation (no longer extracted from headers)
	groupStr := buildGroupNameFromDesignation(groupDesignation)

	// Determine token limit
	// X-Ratelimit-Limit format is "600/15m" or "150/15m" (tokens/window)
	// If headers are missing, we'll use default limits instead of inferring
	tokenLimit := 0
	if limitStr != "" {
		if limit, ok := parseTokenLimitFromHeader(limitStr); ok {
			tokenLimit = limit
		} else {
			logs.DebugCtx(ctx,"failed to parse X-Ratelimit-Limit header, will use default limits",
				"path", path,
				"limit_header", limitStr,
				"format_expected", "tokens/window (e.g., 600/15m)")
		}
	}

	// If we have a group name and this isn't the default limiter (or default doesn't match),
	// check if we need to create/switch to the correct group limiter
	var actualLimiter *GroupLimiter
	if groupStr != "" {
		// Use the group name directly (character ID is part of GroupDesignation if needed)
		fullGroupName := groupStr

		// Check if we already know this path's group
		c.mu.RLock()
		knownGroup, pathKnown := c.pathToGroup[path]
		knownLimiter, hasLimiter := c.limiters[fullGroupName]
		c.mu.RUnlock()

		if pathKnown && knownGroup == fullGroupName && hasLimiter {
			// We know this path belongs to this group and limiter exists
			actualLimiter = knownLimiter
		} else if fullGroupName != gl.Name || !hasLimiter {
			// This is a new group discovery or group name mismatch
			// Log headers for debugging when discovering a new group
			logs.DebugCtx(ctx,"discovering new group with headers",
				"path", path,
				"group", fullGroupName,
				"limit_header", limitStr,
				"remaining_header", remainingStr,
				"used_header", usedStr,
				"parsed_token_limit", tokenLimit)
			// hasHeaders is true only if we have valid rate limit information
			// Either a successfully parsed token limit, or valid usage headers
			hasHeaders := tokenLimit > 0 || (remainingStr != "" && usedStr != "")
			actualLimiter = c.GetOrCreateGroupLimiter(ctx, groupStr, path, tokenLimit, hasHeaders)
		} else {
			// Same group, use existing limiter
			actualLimiter = gl
		}
	} else {
		// No group header - use the limiter we used for the request (default limiter)
		// This happens when:
		// 1. The route hasn't had rate limiting rolled out yet (pre-rollout)
		// 2. ESI server isn't sending group headers for some reason
		// 3. We're hitting an old endpoint that doesn't support grouping
		//
		// Behavior: All paths without group headers use the default limiter which has
		// a steady request rate limit. This provides basic rate limiting while we wait
		// for ESI to provide group information.
		actualLimiter = gl

		// Log this scenario so we can track which paths don't have group headers
		logs.DebugCtx(ctx,"response missing X-Ratelimit-Group header, using default limiter",
			"path", path,
			"status", resp.StatusCode,
			"limiter", gl.Name,
			"limiter_rate", fmt.Sprintf("%.2f req/s", gl.Limiter.Limit()),
			"has_limit_header", limitStr != "",
			"has_remaining_header", remainingStr != "",
			"has_used_header", usedStr != "",
			"note", "default limiter provides steady rate limiting for paths without group headers")

		// Note: We intentionally don't map the path to any group, so future requests will continue
		// using the default limiter. This means:
		// - Unknown paths without headers will stay on default limiter (steady rate)
		// - The default limiter uses rate limiting only (no token bucket tracking)
		// - The default limiter has a steady request rate (RPS limit) that prevents bursts
		// - This is the desired behavior for pre-rollout and unknown endpoints
	}

	// If no group info (using default limiter), skip token bucket tracking
	// Only use rate limiter (requestsPerSecond) for default limiter
	// But still handle retry-after for 429 responses
	if groupStr == "" {
		// Handle 429 responses with Retry-After (even without token tracking)
		if resp.StatusCode == http.StatusTooManyRequests {
			actualLimiter.mu.Lock()
			retryAfterStr := resp.Header.Get("Retry-After")
			if retryAfterStr != "" {
				if seconds, err := strconv.Atoi(retryAfterStr); err == nil {
					actualLimiter.retryAfter = now.Add(time.Duration(seconds) * time.Second)
					logs.WarnCtx(ctx,"ESI rate limit exceeded (default limiter), waiting for retry",
						"path", path,
						"retry_after_seconds", seconds,
						"limiter", actualLimiter.Name)
				}
			} else {
				// Default to window duration if no Retry-After
				actualLimiter.retryAfter = now.Add(actualLimiter.windowDuration)
			}
			actualLimiter.mu.Unlock()
		}

		logs.DebugCtx(ctx,"skipping token bucket updates for default limiter (no group info)",
			"path", path,
			"limiter", actualLimiter.Name,
			"rate", fmt.Sprintf("%.2f req/s", actualLimiter.Limiter.Limit()),
			"note", "default limiter uses rate limiting only, no token tracking")
		return actualLimiter
	}

	// Check if token restrictions are enforced before tracking consumptions
	actualLimiter.mu.RLock()
	enforceTokens := actualLimiter.EnforceTokenRestrictions
	actualLimiter.mu.RUnlock()

	// Only track token consumptions if token restrictions are enforced
	if enforceTokens {
		// Clean up old consumptions first
		logs.DebugCtx(ctx, "calling CleanupOldConsumptions", "path", path, "group", actualLimiter.Name)
		actualLimiter.CleanupOldConsumptions(ctx)
		logs.DebugCtx(ctx, "CleanupOldConsumptions returned", "path", path, "group", actualLimiter.Name)
	}

	// Lock for token limit updates and token usage tracking
	logs.DebugCtx(ctx, "locking limiter in updateFromHeaders", "path", path, "group", actualLimiter.Name)
	actualLimiter.mu.Lock()
	defer func() {
		logs.DebugCtx(ctx, "unlocking limiter in updateFromHeaders", "path", path, "group", actualLimiter.Name)
		actualLimiter.mu.Unlock()
	}()

	// Update token limit if provided and different
	// IMPORTANT: This update happens regardless of response status code (including 429),
	// because rate limit headers are present even in error responses and provide valuable
	// information about the actual limits and current usage.
	// NOTE: We already hold actualLimiter.mu.Lock() from line 178, so don't lock again!
	if tokenLimit > 0 && tokenLimit != actualLimiter.TokenLimit {
		oldLimit := actualLimiter.TokenLimit
		actualLimiter.TokenLimit = tokenLimit

		// Update the rate limiter to match the new token limit
		// Calculate a conservative rate: tokens per 15 minutes / 15 minutes / 60 seconds
		// This ensures we don't exceed the token limit over time
		// Using a conservative estimate of 2 tokens per request
		tokensPerSecond := float64(tokenLimit) / (15 * 60) // tokens per second
		requestsPerSecond := tokensPerSecond / 2.0         // conservative: 2 tokens per request
		if requestsPerSecond < 0.1 {
			requestsPerSecond = 0.1 // Minimum 0.1 req/s to avoid being too restrictive
		}
		newRate := rate.Limit(requestsPerSecond)
		actualLimiter.Limiter.SetLimit(newRate)

		// Adjust burst to be a small fraction of the token limit (e.g., 5% or minimum 5)
		newBurst := tokenLimit / 20
		if newBurst < 5 {
			newBurst = 5
		}
		if newBurst > 100 {
			newBurst = 100 // Cap burst to prevent excessive bursts
		}
		actualLimiter.Limiter.SetBurst(newBurst)
		// NOTE: Don't unlock here - we're already holding the lock from line 178

		logs.DebugCtx(ctx,"updated token limit and rate limiter from response header",
			"limiter", actualLimiter.Name,
			"path", path,
			"status_code", resp.StatusCode,
			"old_limit", oldLimit,
			"new_limit", tokenLimit,
			"new_rate", fmt.Sprintf("%.2f req/s", requestsPerSecond),
			"new_burst", newBurst)
	}

	// Only track token usage and consumptions if token restrictions are enforced
	if enforceTokens {
		// Use server-provided remaining if available, otherwise calculate from consumption
		// IMPORTANT: This update happens regardless of response status code (including 429),
		// because rate limit headers contain current usage information even in error responses.
		oldTokenUsed := actualLimiter.TokenUsed
		if remainingStr != "" {
			if remaining, err := strconv.Atoi(remainingStr); err == nil {
				// Server knows best - use their count
				if usedStr != "" {
					if used, err := strconv.Atoi(usedStr); err == nil {
						actualLimiter.TokenUsed = used
						// Also track consumption locally so CleanupOldConsumptions works correctly
						actualLimiter.consumptions = append(actualLimiter.consumptions, TokenConsumption{
							Tokens:   tokensConsumed,
							Consumed: now,
						})
						logs.DebugCtx(ctx,"updated token usage from X-Ratelimit-Used header",
							"limiter", actualLimiter.Name,
							"path", path,
							"status_code", resp.StatusCode,
							"old_used", oldTokenUsed,
							"new_used", used,
							"remaining", remaining,
							"limit", actualLimiter.TokenLimit)
					}
				} else {
					newUsed := actualLimiter.TokenLimit - remaining
					actualLimiter.TokenUsed = newUsed
					// Also track consumption locally so CleanupOldConsumptions works correctly
					actualLimiter.consumptions = append(actualLimiter.consumptions, TokenConsumption{
						Tokens:   tokensConsumed,
						Consumed: now,
					})
					logs.DebugCtx(ctx,"calculated token usage from X-Ratelimit-Remaining",
						"limiter", actualLimiter.Name,
						"path", path,
						"status_code", resp.StatusCode,
						"old_used", oldTokenUsed,
						"new_used", newUsed,
						"remaining", remaining,
						"limit", actualLimiter.TokenLimit)
				}
			}
		} else {
			// Track consumption locally (no server headers available)
			beforeCount := len(actualLimiter.consumptions)
			actualLimiter.consumptions = append(actualLimiter.consumptions, TokenConsumption{
				Tokens:   tokensConsumed,
				Consumed: now,
			})
			actualLimiter.TokenUsed += tokensConsumed

			logs.DebugCtx(ctx,"tracked token consumption locally (no server headers)",
				"limiter", actualLimiter.Name,
				"path", path,
				"old_used", oldTokenUsed,
				"new_used", actualLimiter.TokenUsed,
				"tokens_consumed", tokensConsumed,
				"consumption_count", len(actualLimiter.consumptions),
				"consumption_history_added", len(actualLimiter.consumptions)-beforeCount)
		}
	}

	// Handle 429 responses with Retry-After
	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfterStr := resp.Header.Get("Retry-After")
		if retryAfterStr != "" {
			if seconds, err := strconv.Atoi(retryAfterStr); err == nil {
				actualLimiter.retryAfter = now.Add(time.Duration(seconds) * time.Second)
				logs.WarnCtx(ctx,"ESI rate limit exceeded, waiting for retry",
					"group", groupStr,
					"retry_after_seconds", seconds,
					"limit", actualLimiter.TokenLimit,
					"used", actualLimiter.TokenUsed)
			}
		} else {
			// Default to window duration if no Retry-After
			actualLimiter.retryAfter = now.Add(actualLimiter.windowDuration)
		}
	}

	// Log rate limit status periodically
	if remainingStr != "" {
		if remaining, err := strconv.Atoi(remainingStr); err == nil {
			remainingPercent := float64(remaining) / float64(actualLimiter.TokenLimit) * 100
			if remainingPercent < 10 {
				logs.WarnCtx(ctx,"ESI rate limit low",
					"group", groupStr,
					"limiter", actualLimiter.Name,
					"path", path,
					"remaining", remaining,
					"limit", actualLimiter.TokenLimit,
					"used", actualLimiter.TokenUsed,
					"percent", fmt.Sprintf("%.1f%%", remainingPercent))
			} else if remainingPercent < 25 {
				// Log at debug level for 10-25% remaining
				logs.DebugCtx(ctx,"ESI rate limit moderate",
					"group", groupStr,
					"limiter", actualLimiter.Name,
					"path", path,
					"remaining", remaining,
					"limit", actualLimiter.TokenLimit,
					"used", actualLimiter.TokenUsed,
					"percent", fmt.Sprintf("%.1f%%", remainingPercent))
			}
		}
	} else if groupStr == "" {
		// Log when we have no group header AND no remaining header - helps identify problematic endpoints
		logs.DebugCtx(ctx, "response missing rate limit headers",
			"path", path,
			"status", resp.StatusCode,
			"limiter", actualLimiter.Name,
			"token_used", actualLimiter.TokenUsed,
			"token_limit", actualLimiter.TokenLimit,
			"note", "no X-Ratelimit-Group or X-Ratelimit-Remaining headers")
	}

	return actualLimiter
}

// Do performs a rate-limited HTTP request for the given endpoint.
// Returns the response body, status code, headers, and any error.
// groupDesignation is required and specifies the rate limit group (format: PrimaryGroup-SecondaryGroup).
// Character ID should be included in groupDesignation.SecondaryGroup if needed.
func (c *ESIClient) Do(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) ([]byte, *http.Response, error) {
	groupName := buildGroupNameFromDesignation(groupDesignation)
	logs.DebugCtx(ctx,"ESI request initiated",
		"method", method,
		"path", path,
		"group_name", groupName,
		"primary_group", groupDesignation.PrimaryGroup,
		"secondary_group", groupDesignation.SecondaryGroup)

	// Get limiter for this group designation
	gl, known := c.GetLimiterForGroup(groupDesignation)

	// If group limiter doesn't exist yet, use mutex to prevent concurrent requests to same unknown group
	var pathMutex *sync.Mutex
	if !known {
		logs.DebugCtx(ctx,"acquiring mutex for unknown group discovery",
			"path", path,
			"group", groupName,
			"current_limiter", gl.Name)
		pathMutex = c.GetMutexForUnknownPath(path)
		pathMutex.Lock()
		defer func() {
			pathMutex.Unlock()
			logs.DebugCtx(ctx,"released mutex for path",
				"path", path)
			// Clean up mutex after discovery completes (if path is now known)
			c.CleanupMutexForPath(path)
		}()
	}

	// Estimate tokens needed (assume 2XX response = 2 tokens for now)
	estimatedTokens := 2
	logs.DebugCtx(ctx,"estimated token cost",
		"path", path,
		"group", gl.Name,
		"estimated_tokens", estimatedTokens)

	// Check if we can make the request (token bucket + retry-after)
	// Return immediately with classified error if rate limited - let task decide how to handle
	if err := gl.CanMakeRequest(ctx, estimatedTokens); err != nil {
		logs.DebugCtx(ctx,"rate limit check failed, returning classified error",
			"path", path,
			"group", gl.Name,
			"error", err)
		return nil, nil, err
	}

	// Wait for general rate limiter (prevents burst)
	rateWaitStart := time.Now()
	if err := gl.Limiter.Wait(ctx); err != nil {
		logs.ErrorCtx(ctx,"rate limiter wait failed",
			"path", path,
			"group", gl.Name,
			"error", err)
		return nil, nil, fmt.Errorf("rate wait failed: %w", err)
	}
	rateWaitDuration := time.Since(rateWaitStart)
	if rateWaitDuration > 100*time.Millisecond {
		logs.DebugCtx(ctx,"rate limiter wait duration",
			"path", path,
			"group", gl.Name,
			"		wait_duration", rateWaitDuration)
	}

	logs.DebugCtx(ctx,"making HTTP request",
		"method", method,
		"path", path,
		"group", gl.Name,
		"url", c.baseURL+path)

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
		logs.ErrorCtx(ctx,"HTTP request failed",
			"path", path,
			"group", gl.Name,
			"error", err,
			"duration", requestDuration)
		return nil, nil, err
	}

	// Calculate actual tokens consumed
	tokensConsumed := getTokensForStatus(resp.StatusCode)
	logs.DebugCtx(ctx,"ESI response received",
		"path", path,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"duration", requestDuration,
		"group", gl.Name,
		"content_length", resp.ContentLength)

	// Handle server feedback synchronously to ensure proper tracking
	// This will discover/create the group limiter if needed
	// Use provided group designation (no longer extracted from headers)
	logs.DebugCtx(ctx,"ABOUT TO CALL updateFromHeaders", "path", path, "group", gl.Name)
	actualLimiter := c.updateFromHeaders(ctx, gl, resp, tokensConsumed, path, groupDesignation)
	logs.DebugCtx(ctx,"RETURNED FROM updateFromHeaders", "path", path, "group", actualLimiter.Name)

	// Update last used time for the actual limiter
	actualLimiter.mu.Lock()
	actualLimiter.lastUsed = time.Now()
	actualLimiter.mu.Unlock()

	// If we discovered a new group and were using default, update gl for next iteration
	if actualLimiter != gl {
		logs.DebugCtx(ctx,"switched to discovered group limiter",
			"path", path,
			"old_group", gl.Name,
			"new_group", actualLimiter.Name,
			"new_token_limit", actualLimiter.TokenLimit)
		gl = actualLimiter
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		resp.Body.Close()
		return nil, resp, err
	}

	// Handle 429 responses - return classified error for task to handle
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

		actualLimiter.mu.RLock()
		tokenUsed := actualLimiter.TokenUsed
		tokenLimit := actualLimiter.TokenLimit
		actualLimiter.mu.RUnlock()

		err := &RateLimitError{
			Retryable:       retryable,
			RetryAfter:      retryAfterTime,
			Reason:          "server returned 429 Too Many Requests",
			Group:           actualLimiter.Name,
			TokenUsed:       tokenUsed,
			TokenLimit:      tokenLimit,
			EstimatedTokens: tokensConsumed,
		}

		logs.WarnCtx(ctx,"received 429, returning classified error for task handling",
			"path", path,
			"group", actualLimiter.Name,
			"retryable", retryable,
			"retry_after", retryAfterTime,
			"retry_after_seconds", retryAfterStr)

		return nil, resp, err
	}

	// Get final token status for logging
	actualLimiter.mu.RLock()
	enforceTokens := actualLimiter.EnforceTokenRestrictions
	finalTokenUsed := actualLimiter.TokenUsed
	finalTokenLimit := actualLimiter.TokenLimit
	finalRemaining := finalTokenLimit - finalTokenUsed
	actualLimiter.mu.RUnlock()

	// Build log fields
	logFields := []interface{}{
		"path", path,
		"group", actualLimiter.Name,
		"status", resp.StatusCode,
		"enforce_token_restrictions", enforceTokens,
		"rate_limit", fmt.Sprintf("%.2f req/s", actualLimiter.Limiter.Limit()),
		"body_size", len(body),
	}

	// Only include token details when token restrictions are enforced
	if enforceTokens {
		var remainingPercent string
		if finalTokenLimit > 0 {
			remainingPercent = fmt.Sprintf("%.1f%%", float64(finalRemaining)/float64(finalTokenLimit)*100)
		} else {
			remainingPercent = "N/A"
		}
		logFields = append(logFields,
			"tokens_consumed", tokensConsumed,
			"token_used", finalTokenUsed,
			"token_limit", finalTokenLimit,
			"token_remaining", finalRemaining,
			"remaining_percent", remainingPercent,
		)
	}

	logs.InfoCtx(ctx, "ESI request completed successfully", logFields...)

	return body, resp, nil
}

// DoRequest performs a rate-limited HTTP request and returns just the response.
// This is useful when you need full control over reading the response body (e.g., for streaming).
// Note: Token consumption will be tracked when the response status code is read.
// groupDesignation is required and specifies the rate limit group (format: PrimaryGroup-SecondaryGroup).
// Character ID should be included in groupDesignation.SecondaryGroup if needed.
func (c *ESIClient) DoRequest(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) (*http.Response, error) {
	groupName := buildGroupNameFromDesignation(groupDesignation)
	logs.DebugCtx(ctx,"ESI request initiated (streaming)",
		"method", method,
		"path", path,
		"group_name", groupName,
		"primary_group", groupDesignation.PrimaryGroup,
		"secondary_group", groupDesignation.SecondaryGroup)

	// Get limiter for this group designation
	gl, known := c.GetLimiterForGroup(groupDesignation)

	// If group limiter doesn't exist yet, use mutex to prevent concurrent requests to same unknown group
	var pathMutex *sync.Mutex
	if !known {
		logs.DebugCtx(ctx,"acquiring mutex for unknown group discovery (streaming)",
			"path", path,
			"group", groupName,
			"current_limiter", gl.Name)
		pathMutex = c.GetMutexForUnknownPath(path)
		pathMutex.Lock()
		defer func() {
			pathMutex.Unlock()
			logs.DebugCtx(ctx,"released mutex for path (streaming)",
				"path", path)
			// Clean up mutex after discovery completes (if path is now known)
			c.CleanupMutexForPath(path)
		}()
	}

	// Estimate tokens needed (assume 2XX response = 2 tokens for now)
	estimatedTokens := 2
	logs.DebugCtx(ctx,"estimated token cost (streaming)",
		"path", path,
		"group", gl.Name,
		"estimated_tokens", estimatedTokens)

	// Check if we can make the request (token bucket + retry-after)
	// Return immediately with classified error if rate limited - let task decide how to handle
	if err := gl.CanMakeRequest(ctx, estimatedTokens); err != nil {
		logs.DebugCtx(ctx,"rate limit check failed, returning classified error (streaming)",
			"path", path,
			"group", gl.Name,
			"error", err)
		return nil, err
	}

	// Wait for general rate limiter (prevents burst)
	rateWaitStart := time.Now()
	if err := gl.Limiter.Wait(ctx); err != nil {
		logs.ErrorCtx(ctx,"rate limiter wait failed (streaming)",
			"path", path,
			"group", gl.Name,
			"error", err)
		return nil, fmt.Errorf("rate wait failed: %w", err)
	}
	rateWaitDuration := time.Since(rateWaitStart)
	if rateWaitDuration > 100*time.Millisecond {
		logs.DebugCtx(ctx,"rate limiter wait duration (streaming)",
			"path", path,
			"group", gl.Name,
			"		wait_duration", rateWaitDuration)
	}

	logs.DebugCtx(ctx,"making HTTP request (streaming)",
		"method", method,
		"path", path,
		"group", gl.Name,
		"url", c.baseURL+path)

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
		logs.ErrorCtx(ctx,"HTTP request failed (streaming)",
			"path", path,
			"group", gl.Name,
			"error", err,
			"duration", requestDuration)
		return nil, err
	}

	// Calculate actual tokens consumed based on status
	tokensConsumed := getTokensForStatus(resp.StatusCode)
	logs.DebugCtx(ctx,"ESI response received (streaming)",
		"path", path,
		"status", resp.StatusCode,
		"tokens_consumed", tokensConsumed,
		"duration", requestDuration,
		"group", gl.Name,
		"content_length", resp.ContentLength)

	// Handle server feedback synchronously to ensure proper tracking
	// This will discover/create the group limiter if needed
	// Use provided group designation (no longer extracted from headers)
	actualLimiter := c.updateFromHeaders(ctx, gl, resp, tokensConsumed, path, groupDesignation)

	// Update last used time for the actual limiter
	actualLimiter.mu.Lock()
	actualLimiter.lastUsed = time.Now()
	actualLimiter.mu.Unlock()

	// If we discovered a new group and were using default, update gl for next iteration
	if actualLimiter != gl {
		logs.DebugCtx(ctx,"switched to discovered group limiter (streaming)",
			"path", path,
			"old_group", gl.Name,
			"new_group", actualLimiter.Name,
			"new_token_limit", actualLimiter.TokenLimit)
		gl = actualLimiter
	}

	// Handle 429 responses - return classified error for task to handle
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

		actualLimiter.mu.RLock()
		tokenUsed := actualLimiter.TokenUsed
		tokenLimit := actualLimiter.TokenLimit
		actualLimiter.mu.RUnlock()

		err := &RateLimitError{
			Retryable:       retryable,
			RetryAfter:      retryAfterTime,
			Reason:          "server returned 429 Too Many Requests",
			Group:           actualLimiter.Name,
			TokenUsed:       tokenUsed,
			TokenLimit:      tokenLimit,
			EstimatedTokens: tokensConsumed,
		}

		logs.WarnCtx(ctx,"received 429, returning classified error for task handling (streaming)",
			"path", path,
			"group", actualLimiter.Name,
			"retryable", retryable,
			"retry_after", retryAfterTime,
			"retry_after_seconds", retryAfterStr)

		return nil, err
	}

	// Get final token status for logging
	actualLimiter.mu.RLock()
	enforceTokens := actualLimiter.EnforceTokenRestrictions
	finalTokenUsed := actualLimiter.TokenUsed
	finalTokenLimit := actualLimiter.TokenLimit
	finalRemaining := finalTokenLimit - finalTokenUsed
	actualLimiter.mu.RUnlock()

	// Build log fields
	logFields := []interface{}{
		"path", path,
		"group", actualLimiter.Name,
		"status", resp.StatusCode,
		"enforce_token_restrictions", enforceTokens,
		"rate_limit", fmt.Sprintf("%.2f req/s", actualLimiter.Limiter.Limit()),
	}

	// Only include token details when token restrictions are enforced
	if enforceTokens {
		var remainingPercent string
		if finalTokenLimit > 0 {
			remainingPercent = fmt.Sprintf("%.1f%%", float64(finalRemaining)/float64(finalTokenLimit)*100)
		} else {
			remainingPercent = "N/A"
		}
		logFields = append(logFields,
			"tokens_consumed", tokensConsumed,
			"token_used", finalTokenUsed,
			"token_limit", finalTokenLimit,
			"token_remaining", finalRemaining,
			"remaining_percent", remainingPercent,
		)
	}

	logs.DebugCtx(ctx,"ESI request completed (streaming response)", logFields...)

	return resp, nil
}

// ClientInterface defines the interface for the ESI rate-limited client.
// This allows for easier testing and abstraction.
type ClientInterface interface {
	// Do performs a rate-limited HTTP request and returns the response body, response, and error.
	// groupDesignation is required and specifies the rate limit group (format: PrimaryGroup-SecondaryGroup).
	// Character ID should be included in groupDesignation.SecondaryGroup if needed.
	Do(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) ([]byte, *http.Response, error)
	// DoRequest performs a rate-limited HTTP request and returns the response.
	// Useful when you need full control over reading the response body (e.g., for streaming).
	// groupDesignation is required and specifies the rate limit group (format: PrimaryGroup-SecondaryGroup).
	// Character ID should be included in groupDesignation.SecondaryGroup if needed.
	DoRequest(ctx context.Context, method, path string, headers map[string]string, groupDesignation GroupDesignation) (*http.Response, error)
}
