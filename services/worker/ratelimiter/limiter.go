package ratelimiter

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"eve-industry-planner/shared/logs"

	"golang.org/x/time/rate"
)

// CleanupOldConsumptions removes token consumptions older than the window duration
func (gl *GroupLimiter) CleanupOldConsumptions(ctx context.Context) {
	now := time.Now()
	cutoff := now.Add(-gl.windowDuration)

	gl.mu.Lock()
	defer gl.mu.Unlock()

	beforeCount := len(gl.consumptions)
	beforeTokens := gl.TokenUsed

	// Remove consumptions older than the window
	validConsumptions := make([]TokenConsumption, 0, len(gl.consumptions))
	totalTokens := 0
	expiredTokens := 0
	for _, cons := range gl.consumptions {
		if cons.Consumed.After(cutoff) {
			validConsumptions = append(validConsumptions, cons)
			totalTokens += cons.Tokens
		} else {
			expiredTokens += cons.Tokens
		}
	}
	gl.consumptions = validConsumptions
	gl.TokenUsed = totalTokens
	gl.lastUpdate = now

	if expiredTokens > 0 || beforeCount != len(validConsumptions) {
		logs.DebugCtx(ctx, "cleaned up old token consumptions",
			"group", gl.Name,
			"before_count", beforeCount,
			"after_count", len(validConsumptions),
			"before_tokens", beforeTokens,
			"after_tokens", totalTokens,
			"expired_tokens", expiredTokens,
			"window_duration", gl.windowDuration)
	}
}

// CanMakeRequest checks if we have enough tokens and aren't in a retry-after period
// IMPORTANT: This is a read-only check. Tokens are not reserved here - they're updated
// after the HTTP request completes. This means multiple concurrent requests can pass
// this check and all make requests, potentially causing token_used to exceed token_limit.
// The server's X-Ratelimit-Used header will reflect the true usage.
func (gl *GroupLimiter) CanMakeRequest(ctx context.Context, estimatedTokens int) error {
	// Clean up expired tokens first to ensure accurate token count
	// This proactively returns expired tokens to the bucket (15-minute floating window)
	gl.CleanupOldConsumptions(ctx)

	gl.mu.RLock()
	retryAfter := gl.retryAfter
	tokenUsed := gl.TokenUsed
	tokenLimit := gl.TokenLimit
	gl.mu.RUnlock()

	now := time.Now()

	// Check if we're in retry-after period (from previous 429 response)
	if now.Before(retryAfter) {
		waitTime := time.Until(retryAfter)
		logs.DebugCtx(ctx, "request blocked by retry-after",
			"group", gl.Name,
			"retry_after", retryAfter,
			"wait_time", waitTime,
			"estimated_tokens", estimatedTokens)
		return &RateLimitError{
			Retryable:       true,
			RetryAfter:      retryAfter,
			Reason:          "retry-after period active",
			Group:           gl.Name,
			TokenUsed:       tokenUsed,
			TokenLimit:      tokenLimit,
			EstimatedTokens: estimatedTokens,
		}
	}

	// Skip token bucket checks if token restrictions are not enforced (rate limiting only)
	gl.mu.RLock()
	enforceTokens := gl.EnforceTokenRestrictions
	gl.mu.RUnlock()

	if !enforceTokens {
		logs.DebugCtx(ctx, "token check skipped (no token restrictions, using rate limiter only)",
			"group", gl.Name,
			"estimated_tokens", estimatedTokens)
		return nil
	}

	// If TokenLimit is 0 but we should enforce tokens, treat it as an error condition
	// This shouldn't happen if headers are present, but we should still enforce restrictions
	if tokenLimit == 0 {
		logs.WarnCtx(ctx, "token limit is 0 but token restrictions are enforced, blocking request",
			"group", gl.Name,
			"estimated_tokens", estimatedTokens,
			"note", "this may indicate missing rate limit headers")
		return &RateLimitError{
			Retryable:       false,
			RetryAfter:      now.Add(gl.windowDuration),
			Reason:          "token limit not configured for group limiter",
			Group:           gl.Name,
			TokenUsed:       tokenUsed,
			TokenLimit:      tokenLimit,
			EstimatedTokens: estimatedTokens,
		}
	}

	// Check if we have enough tokens (after cleanup)
	remaining := tokenLimit - tokenUsed
	if tokenUsed+estimatedTokens > tokenLimit {
		// Calculate how many tokens we need to free up
		// deficit = how many tokens we're over the limit
		// tokensNeeded = deficit + estimated tokens for this request
		deficit := tokenUsed - tokenLimit
		tokensNeeded := deficit + estimatedTokens

		// Find when enough tokens will become available by looking at consumptions
		// Since it's a 15-minute sliding window, we need to find the earliest expiry
		// time that gives us enough tokens freed up.
		gl.mu.RLock()
		retryAfterTime := now.Add(gl.windowDuration) // Default: full window if no consumptions
		if len(gl.consumptions) > 0 {
			// Group consumptions by expiry time (consumptions expiring at the same time)
			// and sum tokens for each expiry time
			expiryMap := make(map[time.Time]int)
			for _, cons := range gl.consumptions {
				expiry := cons.Consumed.Add(gl.windowDuration)
				expiryMap[expiry] += cons.Tokens
			}
			gl.mu.RUnlock()

			// Collect unique expiry times and sort them
			expiryTimes := make([]time.Time, 0, len(expiryMap))
			for expiry := range expiryMap {
				expiryTimes = append(expiryTimes, expiry)
			}
			sort.Slice(expiryTimes, func(i, j int) bool {
				return expiryTimes[i].Before(expiryTimes[j])
			})

			// Sum up tokens until we have enough, using expiry times in order
			tokensFreed := 0
			for _, expiry := range expiryTimes {
				tokensFreed += expiryMap[expiry]
				retryAfterTime = expiry
				if tokensFreed >= tokensNeeded {
					break // Found when enough tokens will be available
				}
			}

			// If we don't have enough tokens even after all expire, use the latest expiry
			if tokensFreed < tokensNeeded && len(expiryTimes) > 0 {
				retryAfterTime = expiryTimes[len(expiryTimes)-1]
			}
		} else {
			gl.mu.RUnlock()
		}

		// If tokens will become available soon, mark as retryable
		retryable := false
		if now.Before(retryAfterTime) && time.Until(retryAfterTime) < 5*time.Minute {
			retryable = true
		}

		logs.WarnCtx(ctx, "insufficient tokens after cleanup",
			"group", gl.Name,
			"token_used", tokenUsed,
			"token_limit", tokenLimit,
			"estimated_tokens", estimatedTokens,
			"remaining", remaining,
			"deficit", deficit,
			"tokens_needed", tokensNeeded,
			"retryable", retryable,
			"retry_after", retryAfterTime,
			"wait_duration", time.Until(retryAfterTime))

		return &RateLimitError{
			Retryable:       retryable,
			RetryAfter:      retryAfterTime,
			Reason:          "insufficient tokens",
			Group:           gl.Name,
			TokenUsed:       tokenUsed,
			TokenLimit:      tokenLimit,
			EstimatedTokens: estimatedTokens,
		}
	}

	logs.DebugCtx(ctx, "token check passed",
		"group", gl.Name,
		"token_used", tokenUsed,
		"token_limit", tokenLimit,
		"remaining", remaining,
		"estimated_tokens", estimatedTokens)

	return nil
}

// GetLimiterForGroup gets the limiter for a given group designation.
// If the limiter doesn't exist yet, it will be created when we receive response headers.
// Returns the limiter and whether it already exists (true) or is new/unknown (false).
func (c *ESIClient) GetLimiterForGroup(groupDesignation GroupDesignation) (*GroupLimiter, bool) {
	bg := context.Background()
	groupName := buildGroupNameFromDesignation(groupDesignation)

	c.mu.RLock()
	defer c.mu.RUnlock()

	// Check if limiter exists for this group
	if limiter, exists := c.limiters[groupName]; exists {
		// Update last used time
		limiter.mu.Lock()
		limiter.lastUsed = time.Now()
		limiter.mu.Unlock()

		logs.DebugCtx(bg, "using existing group limiter",
			"group", groupName,
			"primary_group", groupDesignation.PrimaryGroup,
			"secondary_group", groupDesignation.SecondaryGroup,
			"token_limit", limiter.TokenLimit,
			"token_used", limiter.TokenUsed)
		return limiter, true
	}

	// Group limiter doesn't exist yet - return default limiter
	// It will be created when we receive response headers with token limit information
	logs.DebugCtx(bg, "group limiter not yet created, using default limiter",
		"group", groupName,
		"primary_group", groupDesignation.PrimaryGroup,
		"secondary_group", groupDesignation.SecondaryGroup,
		"default_group", c.defLim.Name,
		"default_rate", fmt.Sprintf("%.2f req/s", c.defLim.DefaultRate),
		"default_burst", c.defLim.DefaultBurst,
		"note", "limiter will be created from response headers")
	return c.defLim, false
}

// GetOrCreateGroupLimiter gets an existing group limiter or creates a new one.
// This is called after receiving a response with X-Ratelimit-Group header.
// hasHeaders indicates whether rate limit headers were present in the response.
func (c *ESIClient) GetOrCreateGroupLimiter(ctx context.Context, fullGroupName string, path string, tokenLimit int, hasHeaders bool) *GroupLimiter {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if limiter already exists
	if limiter, exists := c.limiters[fullGroupName]; exists {
		// Update last used time
		limiter.mu.Lock()
		limiter.lastUsed = time.Now()
		limiter.mu.Unlock()

		// Update EnforceTokenRestrictions flag if headers are now present
		// and update token limit if provided and different
		// IMPORTANT: This update happens regardless of response status code (including 429),
		// because rate limit headers are present even in error responses.
		limiter.mu.Lock()
		if hasHeaders {
			// Headers are present, enable token restrictions
			limiter.EnforceTokenRestrictions = true
		}

		if tokenLimit > 0 && tokenLimit != limiter.TokenLimit {
			oldLimit := limiter.TokenLimit
			limiter.TokenLimit = tokenLimit

			// Update the rate limiter to match the new token limit
			// Calculate a conservative rate: tokens per 15 minutes / 15 minutes / 60 seconds
			tokensPerSecond := float64(tokenLimit) / (15 * 60) // tokens per second
			requestsPerSecond := tokensPerSecond / 2.0         // conservative: 2 tokens per request
			if requestsPerSecond < 0.1 {
				requestsPerSecond = 0.1 // Minimum 0.1 req/s
			}
			newRate := rate.Limit(requestsPerSecond)
			limiter.Limiter.SetLimit(newRate)

			// Adjust burst to be a small fraction of the token limit
			newBurst := tokenLimit / 20
			if newBurst < 5 {
				newBurst = 5
			}
			if newBurst > 100 {
				newBurst = 100 // Cap burst
			}
			limiter.Limiter.SetBurst(newBurst)
			limiter.mu.Unlock()

			logs.InfoCtx(ctx, "updated token limit and rate limiter for existing group",
				"group", fullGroupName,
				"path", path,
				"old_limit", oldLimit,
				"new_limit", tokenLimit,
				"new_rate", fmt.Sprintf("%.2f req/s", requestsPerSecond),
				"new_burst", newBurst)
		} else {
			limiter.mu.Unlock()
		}
		// Map this path to the group (may be updating or adding new path to same group)
		oldPath, hadPath := c.pathToGroup[path]
		c.pathToGroup[path] = fullGroupName

		if hadPath && oldPath != fullGroupName {
			logs.InfoCtx(ctx, "path reassigned to different group",
				"path", path,
				"old_group", oldPath,
				"new_group", fullGroupName)
		} else if !hadPath {
			logs.DebugCtx(ctx, "mapped path to existing group",
				"path", path,
				"group", fullGroupName,
				"token_limit", limiter.TokenLimit,
				"token_used", limiter.TokenUsed)
		}
		return limiter
	}

	// Create new limiter for this group
	// Calculate rate and burst based on token limit if available, otherwise use defaults
	var initialRate rate.Limit
	var initialBurst int

	if tokenLimit > 0 {
		// Calculate rate based on token limit: tokens per 15 minutes / 15 minutes / 60 seconds
		// Using conservative estimate of 2 tokens per request
		tokensPerSecond := float64(tokenLimit) / (15 * 60)
		requestsPerSecond := tokensPerSecond / 2.0
		if requestsPerSecond < 0.1 {
			requestsPerSecond = 0.1 // Minimum 0.1 req/s
		}
		initialRate = rate.Limit(requestsPerSecond)

		// Burst is a small fraction of token limit (5% or minimum 5, max 100)
		initialBurst = tokenLimit / 20
		if initialBurst < 5 {
			initialBurst = 5
		}
		if initialBurst > 100 {
			initialBurst = 100
		}
	} else {
		// Use defaults if no token limit available yet
		initialRate = c.defLim.DefaultRate
		initialBurst = c.defLim.DefaultBurst
	}

	// Set EnforceTokenRestrictions based on whether headers were present
	// If headers are present, enforce token restrictions regardless of tokenLimit value
	enforceTokens := hasHeaders

	newLimiter := &GroupLimiter{
		Limiter:                  rate.NewLimiter(initialRate, initialBurst),
		DefaultRate:              c.defLim.DefaultRate,
		DefaultBurst:             c.defLim.DefaultBurst,
		Name:                     fullGroupName,
		EnforceTokenRestrictions: enforceTokens,
		TokenLimit:               tokenLimit,
		consumptions:             make([]TokenConsumption, 0),
		windowDuration:           15 * time.Minute,
		lastUpdate:               time.Now(),
		lastUsed:                 time.Now(),
	}

	if !enforceTokens {
		// Headers are missing - use default rate/burst, no token tracking
		// This should be rare - ESI should always provide X-Ratelimit-Limit header
		// Note: We use default limits because:
		// 1. Limits can change over time
		// 2. We should rely on server headers as the source of truth
		// 3. Wrong limits could cause rate limiting issues
		newLimiter.TokenLimit = 0 // No token tracking
		// Use default rate and burst to match initial default behavior
		newLimiter.Limiter.SetLimit(c.defLim.DefaultRate)
		newLimiter.Limiter.SetBurst(c.defLim.DefaultBurst)

		logs.DebugCtx(ctx, "using default rate limiting for new group (headers missing, no token restrictions)",
			"group", fullGroupName,
			"path", path,
			"rate", fmt.Sprintf("%.2f req/s", float64(c.defLim.DefaultRate)),
			"burst", c.defLim.DefaultBurst,
			"note", "X-Ratelimit-Limit header was not present/invalid. Using rate limiting only.")
	}

	c.limiters[fullGroupName] = newLimiter
	c.pathToGroup[path] = fullGroupName

	logs.DebugCtx(ctx, "discovered new ESI rate limit group",
		"group", fullGroupName,
		"path", path,
		"token_limit", newLimiter.TokenLimit,
		"default_rate", fmt.Sprintf("%.2f req/s", c.defLim.DefaultRate),
		"default_burst", c.defLim.DefaultBurst,
		"total_groups", len(c.limiters))

	return newLimiter
}

// GetMutexForUnknownPath gets or creates a mutex for an unknown path to prevent concurrent discovery.
func (c *ESIClient) GetMutexForUnknownPath(path string) *sync.Mutex {
	bg := context.Background()
	c.unknownGroupMutex.Lock()
	defer c.unknownGroupMutex.Unlock()

	if mutex, exists := c.unknownGroups[path]; exists {
		logs.DebugCtx(bg, "reusing mutex for unknown path",
			"path", path,
			"waiting_paths", len(c.unknownGroups))
		return mutex
	}

	mutex := &sync.Mutex{}
	c.unknownGroups[path] = mutex
	logs.DebugCtx(bg, "created new mutex for unknown path",
		"path", path,
		"total_unknown_paths", len(c.unknownGroups))
	return mutex
}

// CleanupMutexForPath removes the mutex for a path from unknownGroups.
// This prevents memory leaks by cleaning up mutexes after discovery completes.
// We clean up the mutex after a successful request, regardless of whether the path
// got a group header or not. Paths without group headers will use the default limiter
// and don't need the discovery mutex anymore after the first request.
// Should be called after releasing the mutex lock and processing the response.
func (c *ESIClient) CleanupMutexForPath(path string) {
	bg := context.Background()
	// Check if path is now known (without holding unknownGroupMutex to avoid lock ordering issues)
	c.mu.RLock()
	pathKnown := false
	if _, exists := c.pathToGroup[path]; exists {
		pathKnown = true
	}
	c.mu.RUnlock()

	logs.DebugCtx(bg, "cleanupMutexForPath called",
		"path", path,
		"path_known", pathKnown)

	// Clean up the mutex after discovery completes, even if path doesn't have a group header.
	// After the first request, we know whether the path has a group or uses default limiter,
	// so we no longer need the discovery mutex to prevent concurrent requests.
	c.unknownGroupMutex.Lock()
	defer c.unknownGroupMutex.Unlock()

	if _, exists := c.unknownGroups[path]; exists {
		delete(c.unknownGroups, path)
		if pathKnown {
			logs.DebugCtx(bg, "cleaned up mutex for discovered path",
				"path", path,
				"remaining_unknown_paths", len(c.unknownGroups))
		} else {
			logs.DebugCtx(bg, "cleaned up mutex for path using default limiter (no group header)",
				"path", path,
				"remaining_unknown_paths", len(c.unknownGroups))
		}
	} else {
		logs.DebugCtx(bg, "mutex already cleaned up for path",
			"path", path)
	}
}
