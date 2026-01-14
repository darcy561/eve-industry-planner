package ratelimiter

import (
	"testing"
	"time"
)

func TestCleanupUnusedGroups(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")
	client.maxIdleTime = 1 * time.Hour

	now := time.Now()

	// Create some groups with different last used times
	group1 := "group1"
	group2 := "group2"
	group3 := "group3"

	client.AddGroupLimiter(group1, 1.0, 10)
	client.AddGroupLimiter(group2, 1.0, 10)
	client.AddGroupLimiter(group3, 1.0, 10)

	// Set last used times
	client.mu.Lock()
	client.limiters[group1].mu.Lock()
	client.limiters[group1].lastUsed = now.Add(-30 * time.Minute) // Recent
	client.limiters[group1].mu.Unlock()

	client.limiters[group2].mu.Lock()
	client.limiters[group2].lastUsed = now.Add(-2 * time.Hour) // Old, should be removed
	client.limiters[group2].mu.Unlock()

	client.limiters[group3].mu.Lock()
	client.limiters[group3].lastUsed = now.Add(-30 * time.Minute) // Recent
	client.limiters[group3].mu.Unlock()
	client.mu.Unlock()

	// Map paths to groups
	client.mu.Lock()
	client.pathToGroup["/path1"] = group1
	client.pathToGroup["/path2"] = group2
	client.pathToGroup["/path3"] = group3
	client.mu.Unlock()

	// Run cleanup
	client.CleanupUnusedGroups()

	// Check results
	client.mu.RLock()
	_, group1Exists := client.limiters[group1]
	_, group2Exists := client.limiters[group2]
	_, group3Exists := client.limiters[group3]
	client.mu.RUnlock()

	if !group1Exists {
		t.Error("CleanupUnusedGroups() removed group1, should keep it")
	}

	if group2Exists {
		t.Error("CleanupUnusedGroups() kept group2, should remove it")
	}

	if !group3Exists {
		t.Error("CleanupUnusedGroups() removed group3, should keep it")
	}

	// Check path mappings
	client.mu.RLock()
	_, path1Exists := client.pathToGroup["/path1"]
	_, path2Exists := client.pathToGroup["/path2"]
	_, path3Exists := client.pathToGroup["/path3"]
	client.mu.RUnlock()

	if !path1Exists {
		t.Error("CleanupUnusedGroups() removed path1 mapping")
	}

	if path2Exists {
		t.Error("CleanupUnusedGroups() kept path2 mapping for removed group")
	}

	if !path3Exists {
		t.Error("CleanupUnusedGroups() removed path3 mapping")
	}
}

func TestCleanupUnusedGroups_DefaultLimiter(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")
	client.maxIdleTime = 1 * time.Hour

	now := time.Now()

	// Set default limiter's last used to old time
	client.defLim.mu.Lock()
	client.defLim.lastUsed = now.Add(-2 * time.Hour)
	client.defLim.mu.Unlock()

	// Run cleanup
	client.CleanupUnusedGroups()

	// Default limiter should still exist
	if client.defLim == nil {
		t.Error("CleanupUnusedGroups() removed default limiter")
	}

	// Note: default limiter might not be in the limiters map, but defLim should still exist
	if client.defLim == nil {
		t.Error("CleanupUnusedGroups() defLim is nil")
	}
}

func TestCleanupUnusedGroups_NoUnusedGroups(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")
	client.maxIdleTime = 1 * time.Hour

	now := time.Now()

	// Create groups all with recent last used times
	group1 := "group1"
	client.AddGroupLimiter(group1, 1.0, 10)

	client.mu.Lock()
	client.limiters[group1].mu.Lock()
	client.limiters[group1].lastUsed = now.Add(-30 * time.Minute)
	client.limiters[group1].mu.Unlock()
	initialCount := len(client.limiters)
	client.mu.Unlock()

	// Run cleanup
	client.CleanupUnusedGroups()

	// Check that no groups were removed
	client.mu.RLock()
	finalCount := len(client.limiters)
	client.mu.RUnlock()

	if finalCount != initialCount {
		t.Errorf("CleanupUnusedGroups() removed groups, want no change. Initial: %d, Final: %d", initialCount, finalCount)
	}
}

func TestStartCleanupGoroutine(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")
	client.cleanupInterval = 100 * time.Millisecond
	client.maxIdleTime = 1 * time.Hour

	// Start cleanup goroutine
	stop := client.StartCleanupGoroutine()

	// Wait a bit to ensure it runs
	time.Sleep(150 * time.Millisecond)

	// Stop the goroutine
	stop()

	// Wait a bit to ensure it stops
	time.Sleep(50 * time.Millisecond)

	// If we get here without deadlock, the goroutine stopped successfully
}
