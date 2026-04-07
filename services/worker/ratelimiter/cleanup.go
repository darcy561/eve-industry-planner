package ratelimiter

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

// CleanupUnusedGroups removes group limiters that haven't been used recently.
// Groups that haven't been used for longer than maxIdleTime will be removed.
// The default limiter is never removed.
// This should be called periodically to prevent memory leaks from accumulating unused groups.
func (c *ESIClient) CleanupUnusedGroups() {
	bg := context.Background()
	now := time.Now()
	cutoff := now.Add(-c.maxIdleTime)

	c.mu.Lock()
	defer c.mu.Unlock()

	removedCount := 0
	removedGroups := make([]string, 0)

	// Iterate over all limiters and remove unused ones
	for groupName, limiter := range c.limiters {
		// Never remove the default limiter
		if groupName == "default" || limiter == c.defLim {
			continue
		}

		// Check last used time
		limiter.mu.RLock()
		lastUsed := limiter.lastUsed
		limiter.mu.RUnlock()

		// Remove if idle for too long
		if lastUsed.Before(cutoff) {
			removedGroups = append(removedGroups, groupName)
			delete(c.limiters, groupName)
			removedCount++

			logs.DebugCtx(bg, "removed unused group limiter",
				"group", groupName,
				"last_used", lastUsed,
				"idle_duration", now.Sub(lastUsed),
				"max_idle_time", c.maxIdleTime)
		}
	}

	// Clean up path mappings for removed groups
	if removedCount > 0 {
		pathsToRemove := make([]string, 0)
		for path, mappedGroup := range c.pathToGroup {
			for _, removedGroup := range removedGroups {
				if mappedGroup == removedGroup {
					pathsToRemove = append(pathsToRemove, path)
					break
				}
			}
		}
		for _, path := range pathsToRemove {
			delete(c.pathToGroup, path)
		}

		logs.InfoCtx(bg, "cleaned up unused group limiters",
			"removed_groups", removedCount,
			"removed_paths", len(pathsToRemove),
			"remaining_groups", len(c.limiters),
			"max_idle_time", c.maxIdleTime)
	} else {
		logs.DebugCtx(bg, "no unused groups to clean up",
			"total_groups", len(c.limiters),
			"max_idle_time", c.maxIdleTime)
	}
}

// StartCleanupGoroutine starts a background goroutine that periodically cleans up unused groups.
// The goroutine will run cleanup at the configured cleanupInterval.
// Returns a stop function that can be called to stop the cleanup goroutine.
func (c *ESIClient) StartCleanupGoroutine() func() {
	stopChan := make(chan struct{})

	go func() {
		bg := context.Background()
		ticker := time.NewTicker(c.cleanupInterval)
		defer ticker.Stop()

		logs.DebugCtx(bg, "started group limiter cleanup goroutine",
			"cleanup_interval", c.cleanupInterval,
			"max_idle_time", c.maxIdleTime)

		// Run cleanup immediately on startup
		c.CleanupUnusedGroups()

		for {
			select {
			case <-ticker.C:
				c.CleanupUnusedGroups()
			case <-stopChan:
				logs.InfoCtx(bg, "stopping group limiter cleanup goroutine")
				return
			}
		}
	}()

	return func() {
		close(stopChan)
	}
}
