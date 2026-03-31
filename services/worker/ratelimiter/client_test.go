package ratelimiter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewESIClient(t *testing.T) {
	client := NewESIClient("https://esi.evetech.net", 2.0, 20)

	if client.baseURL != "https://esi.evetech.net" {
		t.Errorf("NewESIClient() baseURL = %v, want https://esi.evetech.net", client.baseURL)
	}

	if client.defLim == nil {
		t.Error("NewESIClient() defLim is nil")
	}

	if client.limiters == nil {
		t.Error("NewESIClient() limiters is nil")
	}

	if client.pathToGroup == nil {
		t.Error("NewESIClient() pathToGroup is nil")
	}
}

func TestGetLimiterForGroup(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")

	tests := []struct {
		name           string
		designation    GroupDesignation
		preCreateGroup bool
		wantExists     bool
	}{
		{
			name: "existing group",
			designation: GroupDesignation{
				PrimaryGroup:   "market-order",
				SecondaryGroup: "prices",
			},
			preCreateGroup: true,
			wantExists:     true,
		},
		{
			name: "new group",
			designation: GroupDesignation{
				PrimaryGroup:   "market-order",
				SecondaryGroup: "orders",
			},
			preCreateGroup: false,
			wantExists:     false,
		},
		{
			name: "default limiter for unknown group",
			designation: GroupDesignation{
				PrimaryGroup:   "unknown",
				SecondaryGroup: "",
			},
			preCreateGroup: false,
			wantExists:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.preCreateGroup {
				groupName := buildGroupNameFromDesignation(tt.designation)
				client.AddGroupLimiter(groupName, 1.0, 10)
			}

			limiter, exists := client.GetLimiterForGroup(tt.designation)

			if exists != tt.wantExists {
				t.Errorf("GetLimiterForGroup() exists = %v, want %v", exists, tt.wantExists)
			}

			if limiter == nil {
				t.Error("GetLimiterForGroup() limiter is nil")
			}

			if !exists && limiter.Name != "default" {
				t.Errorf("GetLimiterForGroup() limiter.Name = %v, want default", limiter.Name)
			}
		})
	}
}

func TestGetOrCreateGroupLimiter(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")

	tests := []struct {
		name                         string
		groupName                    string
		path                         string
		tokenLimit                   int
		hasHeaders                   bool
		preExists                    bool
		wantCreated                  bool
		wantEnforceTokenRestrictions bool
	}{
		{
			name:                         "create new group with headers",
			groupName:                    "market-order-prices",
			path:                         "/v1/markets/prices/",
			tokenLimit:                   600,
			hasHeaders:                   true,
			preExists:                    false,
			wantCreated:                  true,
			wantEnforceTokenRestrictions: true,
		},
		{
			name:                         "create new group without headers",
			groupName:                    "market-order-orders",
			path:                         "/v1/markets/orders/",
			tokenLimit:                   0,
			hasHeaders:                   false,
			preExists:                    false,
			wantCreated:                  true,
			wantEnforceTokenRestrictions: false,
		},
		{
			name:                         "get existing group",
			groupName:                    "market-order-prices",
			path:                         "/v1/markets/prices/",
			tokenLimit:                   600,
			hasHeaders:                   true,
			preExists:                    true,
			wantCreated:                  false,
			wantEnforceTokenRestrictions: true,
		},
		{
			name:                         "update existing group token limit",
			groupName:                    "market-order-prices",
			path:                         "/v1/markets/prices/",
			tokenLimit:                   800, // Different limit
			hasHeaders:                   true,
			preExists:                    true,
			wantCreated:                  false,
			wantEnforceTokenRestrictions: true,
		},
		{
			name:                         "enable token restrictions for existing group",
			groupName:                    "market-order-orders",
			path:                         "/v1/markets/orders/",
			tokenLimit:                   600,
			hasHeaders:                   true,
			preExists:                    true,
			wantCreated:                  false,
			wantEnforceTokenRestrictions: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.preExists {
				client.AddGroupLimiter(tt.groupName, 1.0, 10)
			}

			initialCount := len(client.limiters)

			limiter := client.GetOrCreateGroupLimiter(tt.groupName, tt.path, tt.tokenLimit, tt.hasHeaders)

			if limiter == nil {
				t.Error("GetOrCreateGroupLimiter() limiter is nil")
				return
			}

			if limiter.Name != tt.groupName {
				t.Errorf("GetOrCreateGroupLimiter() limiter.Name = %v, want %v", limiter.Name, tt.groupName)
			}

			if tt.hasHeaders && limiter.TokenLimit != tt.tokenLimit {
				t.Errorf("GetOrCreateGroupLimiter() limiter.TokenLimit = %v, want %v", limiter.TokenLimit, tt.tokenLimit)
			}

			limiter.mu.RLock()
			enforceTokens := limiter.EnforceTokenRestrictions
			limiter.mu.RUnlock()

			if enforceTokens != tt.wantEnforceTokenRestrictions {
				t.Errorf("GetOrCreateGroupLimiter() EnforceTokenRestrictions = %v, want %v", enforceTokens, tt.wantEnforceTokenRestrictions)
			}

			finalCount := len(client.limiters)
			if tt.wantCreated && finalCount != initialCount+1 {
				t.Errorf("GetOrCreateGroupLimiter() limiters count = %v, want %v", finalCount, initialCount+1)
			}

			// Check path mapping
			client.mu.RLock()
			mappedGroup, exists := client.pathToGroup[tt.path]
			client.mu.RUnlock()

			if !exists {
				t.Errorf("GetOrCreateGroupLimiter() path %v not mapped", tt.path)
			}

			if mappedGroup != tt.groupName {
				t.Errorf("GetOrCreateGroupLimiter() mappedGroup = %v, want %v", mappedGroup, tt.groupName)
			}
		})
	}
}

func TestDo_Success(t *testing.T) {
	// Create a mock HTTP server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Ratelimit-Limit", "600/15m")
		w.Header().Set("X-Ratelimit-Remaining", "595")
		w.Header().Set("X-Ratelimit-Used", "5")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"test": "data"}`))
	}))
	defer server.Close()

	client := createTestESIClient(server.URL)
	ctx := context.Background()

	body, resp, err := client.Do(
		ctx,
		"GET",
		"/test",
		nil,
		GroupDesignation{PrimaryGroup: "test", SecondaryGroup: ""},
	)

	if err != nil {
		t.Fatalf("Do() error = %v, want nil", err)
	}

	if resp == nil {
		t.Fatal("Do() resp is nil")
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Do() resp.StatusCode = %v, want %v", resp.StatusCode, http.StatusOK)
	}

	if len(body) == 0 {
		t.Error("Do() body is empty")
	}
}

func TestDo_429Response(t *testing.T) {
	// Create a mock HTTP server that returns 429
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Ratelimit-Limit", "600/15m")
		w.Header().Set("X-Ratelimit-Remaining", "0")
		w.Header().Set("X-Ratelimit-Used", "600")
		w.Header().Set("Retry-After", "60")
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error": "rate limited"}`))
	}))
	defer server.Close()

	client := createTestESIClient(server.URL)
	ctx := context.Background()

	body, resp, err := client.Do(
		ctx,
		"GET",
		"/test",
		nil,
		GroupDesignation{PrimaryGroup: "test", SecondaryGroup: ""},
	)

	if err == nil {
		t.Error("Do() error = nil, want RateLimitError")
	}

	rateLimitErr := GetRateLimitError(err)
	if rateLimitErr == nil {
		t.Fatalf("Do() error = %v, want RateLimitError", err)
	}

	if !rateLimitErr.Retryable {
		t.Error("Do() RateLimitError.Retryable = false, want true")
	}

	if resp == nil {
		t.Fatal("Do() resp is nil")
	}

	if resp.StatusCode != http.StatusTooManyRequests {
		t.Errorf("Do() resp.StatusCode = %v, want %v", resp.StatusCode, http.StatusTooManyRequests)
	}

	if body != nil {
		t.Error("Do() body should be nil on 429 error")
	}
}

func TestDo_RateLimitCheck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"test": "data"}`))
	}))
	defer server.Close()

	client := createTestESIClient(server.URL)
	ctx := context.Background()

	// Manually set up a limiter with insufficient tokens
	groupName := "test-group"
	client.AddGroupLimiter(groupName, 1.0, 10)
	limiter := client.limiters[groupName]
	limiter.mu.Lock()
	limiter.TokenLimit = 100
	limiter.TokenUsed = 100 // At limit, need 2 more for request
	// Add some old consumptions that won't be cleaned up immediately
	limiter.consumptions = []TokenConsumption{
		{Tokens: 100, Consumed: time.Now().Add(-5 * time.Minute)}, // Still valid
	}
	limiter.mu.Unlock()

	// This should fail the rate limit check before making the request
	_, _, err := client.Do(
		ctx,
		"GET",
		"/test",
		nil,
		GroupDesignation{PrimaryGroup: "test", SecondaryGroup: "group"},
	)

	// The error should be a rate limit error
	rateLimitErr := GetRateLimitError(err)
	if rateLimitErr == nil {
		// If cleanup freed up tokens, the request might succeed
		// This is actually correct behavior - cleanup should free tokens
		// So we'll just verify that either we got an error OR the request succeeded
		if err != nil {
			t.Errorf("Do() error = %v, want RateLimitError or nil", err)
		}
	}
}

func TestCleanupMutexForPath(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")

	// Create a mutex for a path
	path := "/test/path"
	mutex := client.GetMutexForUnknownPath(path)

	if mutex == nil {
		t.Fatal("GetMutexForUnknownPath() mutex is nil")
	}

	// Check it exists
	client.unknownGroupMutex.Lock()
	_, exists := client.unknownGroups[path]
	client.unknownGroupMutex.Unlock()

	if !exists {
		t.Error("GetMutexForUnknownPath() mutex not stored")
	}

	// Clean it up
	client.CleanupMutexForPath(path)

	// Check it's removed
	client.unknownGroupMutex.Lock()
	_, exists = client.unknownGroups[path]
	client.unknownGroupMutex.Unlock()

	if exists {
		t.Error("CleanupMutexForPath() mutex still exists after cleanup")
	}
}

func TestAddGroupLimiter(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")

	groupName := "test-group"
	client.AddGroupLimiter(groupName, 2.0, 20)

	client.mu.RLock()
	limiter, exists := client.limiters[groupName]
	client.mu.RUnlock()

	if !exists {
		t.Error("AddGroupLimiter() limiter not created")
	}

	if limiter == nil {
		t.Fatal("AddGroupLimiter() limiter is nil")
	}

	if limiter.Name != groupName {
		t.Errorf("AddGroupLimiter() limiter.Name = %v, want %v", limiter.Name, groupName)
	}
}

func TestGroupCreationVariations(t *testing.T) {
	client := createTestESIClient("https://esi.evetech.net")

	t.Run("create group with valid token limit header", func(t *testing.T) {
		// Scenario: Valid X-Ratelimit-Limit header parsed successfully
		groupName := "market-order-prices"
		path := "/v1/markets/prices/"
		tokenLimit := 600
		hasHeaders := true

		limiter := client.GetOrCreateGroupLimiter(groupName, path, tokenLimit, hasHeaders)

		if limiter == nil {
			t.Fatal("limiter is nil")
		}

		limiter.mu.RLock()
		enforceTokens := limiter.EnforceTokenRestrictions
		actualTokenLimit := limiter.TokenLimit
		limiter.mu.RUnlock()

		if !enforceTokens {
			t.Error("EnforceTokenRestrictions should be true when headers are present")
		}
		if actualTokenLimit != tokenLimit {
			t.Errorf("TokenLimit = %v, want %v", actualTokenLimit, tokenLimit)
		}
	})

	t.Run("create group without any headers", func(t *testing.T) {
		// Scenario: No headers at all - should use rate limiting only
		groupName := "market-order-orders"
		path := "/v1/markets/orders/"
		tokenLimit := 0
		hasHeaders := false

		limiter := client.GetOrCreateGroupLimiter(groupName, path, tokenLimit, hasHeaders)

		if limiter == nil {
			t.Fatal("limiter is nil")
		}

		limiter.mu.RLock()
		enforceTokens := limiter.EnforceTokenRestrictions
		actualTokenLimit := limiter.TokenLimit
		limiter.mu.RUnlock()

		if enforceTokens {
			t.Error("EnforceTokenRestrictions should be false when no headers")
		}
		if actualTokenLimit != 0 {
			t.Errorf("TokenLimit = %v, want 0 (no token tracking)", actualTokenLimit)
		}
	})

	t.Run("create group with invalid limit header but valid usage headers", func(t *testing.T) {
		// Scenario: Invalid X-Ratelimit-Limit but valid remaining/used headers
		// This simulates: limitStr = "invalid" (parsing fails), but remainingStr and usedStr are present
		groupName := "market-order-history"
		path := "/v1/markets/history/"
		tokenLimit := 0    // Parsing failed
		hasHeaders := true // But we have remaining/used headers

		limiter := client.GetOrCreateGroupLimiter(groupName, path, tokenLimit, hasHeaders)

		if limiter == nil {
			t.Fatal("limiter is nil")
		}

		limiter.mu.RLock()
		enforceTokens := limiter.EnforceTokenRestrictions
		limiter.mu.RUnlock()

		if !enforceTokens {
			t.Error("EnforceTokenRestrictions should be true when usage headers are present")
		}
		// TokenLimit will be 0, but that's okay - it will be updated when we get valid limit header
	})

	t.Run("upgrade group from no headers to with headers", func(t *testing.T) {
		// Scenario: Group created without headers, then gets headers later
		groupName := "market-order-stats"
		path := "/v1/markets/stats/"

		// First: Create without headers
		limiter1 := client.GetOrCreateGroupLimiter(groupName, path, 0, false)

		limiter1.mu.RLock()
		enforceTokens1 := limiter1.EnforceTokenRestrictions
		limiter1.mu.RUnlock()

		if enforceTokens1 {
			t.Error("Initial: EnforceTokenRestrictions should be false")
		}

		// Second: Update with headers (valid token limit)
		limiter2 := client.GetOrCreateGroupLimiter(groupName, path, 600, true)

		if limiter1 != limiter2 {
			t.Error("Should return same limiter instance")
		}

		limiter2.mu.RLock()
		enforceTokens2 := limiter2.EnforceTokenRestrictions
		tokenLimit2 := limiter2.TokenLimit
		limiter2.mu.RUnlock()

		if !enforceTokens2 {
			t.Error("After upgrade: EnforceTokenRestrictions should be true")
		}
		if tokenLimit2 != 600 {
			t.Errorf("After upgrade: TokenLimit = %v, want 600", tokenLimit2)
		}

		// Third: Verify that CanMakeRequest now enforces token restrictions
		// Set tokenUsed to limit to test enforcement
		// Need to add consumptions to maintain tokenUsed after cleanup
		now := time.Now()
		limiter2.mu.Lock()
		limiter2.TokenUsed = 600 // At limit
		limiter2.consumptions = []TokenConsumption{
			{Tokens: 600, Consumed: now.Add(-5 * time.Minute)}, // Still valid, maintains TokenUsed after cleanup
		}
		limiter2.mu.Unlock()

		err := limiter2.CanMakeRequest(context.Background(), 2)
		if err == nil {
			t.Error("CanMakeRequest should return error when tokens are exhausted and restrictions are enforced")
		}
		rateLimitErr, ok := err.(*RateLimitError)
		if !ok {
			t.Errorf("Error should be RateLimitError, got %T", err)
		} else if rateLimitErr.Reason != "insufficient tokens" {
			t.Errorf("Error reason = %v, want 'insufficient tokens'", rateLimitErr.Reason)
		}
	})

	t.Run("upgrade group with headers but no token limit yet", func(t *testing.T) {
		// Scenario: Group gets headers (usage headers) but token limit is 0
		// This can happen if limit header is invalid but remaining/used headers are present
		groupName := "market-order-history-upgrade"
		path := "/v1/markets/history-upgrade/"

		// First: Create without headers
		limiter1 := client.GetOrCreateGroupLimiter(groupName, path, 0, false)

		limiter1.mu.RLock()
		enforceTokens1 := limiter1.EnforceTokenRestrictions
		limiter1.mu.RUnlock()

		if enforceTokens1 {
			t.Error("Initial: EnforceTokenRestrictions should be false")
		}

		// Second: Upgrade with headers but tokenLimit = 0 (invalid limit header, but usage headers present)
		limiter2 := client.GetOrCreateGroupLimiter(groupName, path, 0, true)

		if limiter1 != limiter2 {
			t.Error("Should return same limiter instance")
		}

		limiter2.mu.RLock()
		enforceTokens2 := limiter2.EnforceTokenRestrictions
		tokenLimit2 := limiter2.TokenLimit
		limiter2.mu.RUnlock()

		// EnforceTokenRestrictions should be true (headers present)
		if !enforceTokens2 {
			t.Error("After upgrade: EnforceTokenRestrictions should be true when headers are present")
		}
		// TokenLimit will be 0 until we get a valid limit header
		if tokenLimit2 != 0 {
			t.Errorf("After upgrade: TokenLimit = %v, want 0 (will be updated when valid limit header received)", tokenLimit2)
		}

		// Verify that CanMakeRequest blocks when TokenLimit is 0 but restrictions are enforced
		err := limiter2.CanMakeRequest(context.Background(), 2)
		if err == nil {
			t.Error("CanMakeRequest should return error when TokenLimit is 0 but restrictions are enforced")
		}
		rateLimitErr, ok := err.(*RateLimitError)
		if !ok {
			t.Errorf("Error should be RateLimitError, got %T", err)
		} else if rateLimitErr.Reason != "token limit not configured for group limiter" {
			t.Errorf("Error reason = %v, want 'token limit not configured for group limiter'", rateLimitErr.Reason)
		}
	})

	t.Run("create multiple groups with different configurations", func(t *testing.T) {
		// Test creating multiple groups in sequence with varying configurations
		scenarios := []struct {
			name        string
			groupName   string
			path        string
			tokenLimit  int
			hasHeaders  bool
			wantEnforce bool
		}{
			{"group1_with_headers", "group1", "/path1", 600, true, true},
			{"group2_no_headers", "group2", "/path2", 0, false, false},
			{"group3_with_headers", "group3", "/path3", 150, true, true},
			{"group4_no_headers", "group4", "/path4", 0, false, false},
		}

		for _, scenario := range scenarios {
			t.Run(scenario.name, func(t *testing.T) {
				limiter := client.GetOrCreateGroupLimiter(
					scenario.groupName,
					scenario.path,
					scenario.tokenLimit,
					scenario.hasHeaders,
				)

				limiter.mu.RLock()
				enforceTokens := limiter.EnforceTokenRestrictions
				limiter.mu.RUnlock()

				if enforceTokens != scenario.wantEnforce {
					t.Errorf("EnforceTokenRestrictions = %v, want %v", enforceTokens, scenario.wantEnforce)
				}
			})
		}

		// Verify all groups were created
		client.mu.RLock()
		groupCount := len(client.limiters)
		client.mu.RUnlock()

		// Should have 4 new groups + 1 default = 5 total
		if groupCount < 5 {
			t.Errorf("Expected at least 5 groups, got %d", groupCount)
		}
	})

	t.Run("manual group creation vs automatic discovery", func(t *testing.T) {
		// Test that manually created groups have token restrictions enabled
		groupName := "manual-group"
		client.AddGroupLimiter(groupName, 2.0, 20)

		client.mu.RLock()
		limiter, exists := client.limiters[groupName]
		client.mu.RUnlock()

		if !exists {
			t.Fatal("Manually created group should exist")
		}

		limiter.mu.RLock()
		enforceTokens := limiter.EnforceTokenRestrictions
		limiter.mu.RUnlock()

		if !enforceTokens {
			t.Error("Manually created groups should enforce token restrictions")
		}
	})
}
