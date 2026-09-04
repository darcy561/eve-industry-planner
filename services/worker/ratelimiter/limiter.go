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
	gl.mu.Lock()
	defer gl.mu.Unlock()
	gl.cleanupOldConsumptionsLocked(ctx)
}

// cleanupOldConsumptionsLocked drops expired window entries and subtracts them from TokenUsed.
// TokenUsed is not recomputed from the remaining ledger: server headers and in-flight
// reservations can legitimately sit above the sum of local rows.
func (gl *GroupLimiter) cleanupOldConsumptionsLocked(ctx context.Context) {
	now := time.Now()
	cutoff := now.Add(-gl.windowDuration)

	beforeCount := len(gl.consumptions)
	beforeTokens := gl.TokenUsed

	validConsumptions := make([]TokenConsumption, 0, len(gl.consumptions))
	expiredTokens := 0
	for _, cons := range gl.consumptions {
		if cons.Consumed.After(cutoff) {
			validConsumptions = append(validConsumptions, cons)
		} else {
			expiredTokens += cons.Tokens
		}
	}
	gl.consumptions = validConsumptions
	gl.TokenUsed -= expiredTokens
	if gl.TokenUsed < 0 {
		gl.TokenUsed = 0
	}
	gl.lastUpdate = now

	if expiredTokens > 0 || beforeCount != len(validConsumptions) {
		logs.DebugCtx(ctx, "cleaned up old token consumptions",
			"group", gl.Name,
			"before_count", beforeCount,
			"after_count", len(validConsumptions),
			"before_tokens", beforeTokens,
			"after_tokens", gl.TokenUsed,
			"expired_tokens", expiredTokens,
			"window_duration", gl.windowDuration)
	}
}

// CanMakeRequest checks retry-after and the token window, then reserves estimatedTokens
// so concurrent callers cannot all admit against the same remaining budget.
func (gl *GroupLimiter) CanMakeRequest(ctx context.Context, estimatedTokens int) error {
	gl.mu.Lock()
	defer gl.mu.Unlock()

	gl.cleanupOldConsumptionsLocked(ctx)

	now := time.Now()
	retryAfter := gl.retryAfter
	tokenUsed := gl.TokenUsed
	tokenLimit := gl.TokenLimit

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

	if !gl.EnforceTokenRestrictions {
		logs.DebugCtx(ctx, "token check skipped (no token restrictions, using rate limiter only)",
			"group", gl.Name,
			"estimated_tokens", estimatedTokens)
		return nil
	}

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

	remaining := tokenLimit - tokenUsed
	if tokenUsed+estimatedTokens > tokenLimit {
		deficit := tokenUsed - tokenLimit
		tokensNeeded := deficit + estimatedTokens

		retryAfterTime := now.Add(gl.windowDuration)
		if len(gl.consumptions) > 0 {
			expiryMap := make(map[time.Time]int)
			for _, cons := range gl.consumptions {
				expiry := cons.Consumed.Add(gl.windowDuration)
				expiryMap[expiry] += cons.Tokens
			}

			expiryTimes := make([]time.Time, 0, len(expiryMap))
			for expiry := range expiryMap {
				expiryTimes = append(expiryTimes, expiry)
			}
			sort.Slice(expiryTimes, func(i, j int) bool {
				return expiryTimes[i].Before(expiryTimes[j])
			})

			tokensFreed := 0
			for _, expiry := range expiryTimes {
				tokensFreed += expiryMap[expiry]
				retryAfterTime = expiry
				if tokensFreed >= tokensNeeded {
					break
				}
			}

			if tokensFreed < tokensNeeded && len(expiryTimes) > 0 {
				retryAfterTime = expiryTimes[len(expiryTimes)-1]
			}
		}

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

	if estimatedTokens > 0 {
		gl.TokenUsed += estimatedTokens
		gl.consumptions = append(gl.consumptions, TokenConsumption{
			Tokens:   estimatedTokens,
			Consumed: now,
		})
	}

	logs.DebugCtx(ctx, "token check passed",
		"group", gl.Name,
		"token_used", gl.TokenUsed,
		"token_limit", tokenLimit,
		"remaining", tokenLimit-gl.TokenUsed,
		"estimated_tokens", estimatedTokens)

	return nil
}

// ReleaseReservation drops a reservation from CanMakeRequest when the HTTP call
// does not complete (wait / dial / request construction failure).
func (gl *GroupLimiter) ReleaseReservation(estimatedTokens int) {
	if estimatedTokens <= 0 {
		return
	}
	gl.mu.Lock()
	defer gl.mu.Unlock()
	if !gl.EnforceTokenRestrictions {
		return
	}
	gl.releaseReservationLocked(estimatedTokens)
}

func (gl *GroupLimiter) releaseReservationLocked(estimatedTokens int) {
	if estimatedTokens <= 0 {
		return
	}
	gl.TokenUsed -= estimatedTokens
	if gl.TokenUsed < 0 {
		gl.TokenUsed = 0
	}
	for i := len(gl.consumptions) - 1; i >= 0; i-- {
		if gl.consumptions[i].Tokens == estimatedTokens {
			gl.consumptions = append(gl.consumptions[:i], gl.consumptions[i+1:]...)
			return
		}
	}
}

// GetLimiterForGroup gets the limiter for a given group designation.
// If the limiter doesn't exist yet, it will be created when we receive response headers.
// Returns the limiter and whether it already exists (true) or is new/unknown (false).
func (c *ESIClient) GetLimiterForGroup(groupDesignation GroupDesignation) (*GroupLimiter, bool) {
	bg := context.Background()
	groupName := buildGroupNameFromDesignation(groupDesignation)

	c.mu.RLock()
	defer c.mu.RUnlock()

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

		// Applied whatever the status code, 429 included: ESI sends the rate limit
		// headers on an error response too.
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
			newBurst := min(max(tokenLimit/20, 5),
				// Cap burst
				100)
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
		initialBurst = min(max(tokenLimit/20, 5), 100)
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
		// No X-Ratelimit-Limit header, which should be rare. The server headers are
		// the source of truth for a group's limits, so nothing is guessed here:
		// token tracking is off and the defaults stand in.
		newLimiter.TokenLimit = 0
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

// CleanupMutexForPath drops a path's discovery mutex from unknownGroups, so the
// map does not grow without bound.
//
// Call it after releasing the lock and processing the response, whether or not
// the path turned out to have a group: a path that stays on the default limiter
// has no more discovery to do either.
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

	// One request settles whether the path has a group or falls back to the
	// default limiter, so discovery is done and the mutex has nothing left to
	// guard — dropped even when no group header arrived.
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
