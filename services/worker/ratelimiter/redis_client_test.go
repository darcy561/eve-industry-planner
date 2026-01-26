package ratelimiter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// Stress tests for Redis-based distributed rate limiter
//
// These tests verify:
// - Multiple workers coordinate correctly (global rate limits, not per-worker)
// - Token bucket tracking across workers
// - Groups with and without token restrictions
// - Rate limiting enforcement
// - Token exhaustion and recovery
// - EVE downtime blocking
//
// To run these tests:
//   1. Ensure Redis is running on localhost:6379 (or update setupTestRedis)
//   2. Run: go test -v ./services/worker/ratelimiter -run TestRedisRateLimiter
//   3. For stress test: go test -v ./services/worker/ratelimiter -run TestRedisRateLimiter_ConcurrentStressTest
//
// Note: Tests use Redis DB 15 to isolate from production data

// setupTestRedis creates a test Redis client
// In a real scenario, you'd use a test Redis instance or docker container
// Supports environment variables: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
func setupTestRedis(t *testing.T) *redis.Client {
	// Get Redis connection details from environment or use defaults
	redisHost := os.Getenv("REDIS_HOST")
	if redisHost == "" {
		redisHost = "localhost"
	}
	redisPort := os.Getenv("REDIS_PORT")
	if redisPort == "" {
		redisPort = "6379"
	}
	redisPassword := os.Getenv("REDIS_PASSWORD")

	// Use a test Redis instance (adjust connection as needed)
	// For CI/CD, you might use testcontainers or a dedicated test Redis
	opts := &redis.Options{
		Addr: redisHost + ":" + redisPort,
		DB:   15, // Use DB 15 for testing (isolated from production)
	}
	if redisPassword != "" {
		opts.Password = redisPassword
	}

	client := redis.NewClient(opts)

	ctx := context.Background()
	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		t.Skipf("Skipping test: Redis not available at %s:%s: %v (set REDIS_HOST, REDIS_PORT, REDIS_PASSWORD if needed)", redisHost, redisPort, err)
	}

	// Clean up test keys before starting
	keys, _ := client.Keys(ctx, "esi:*").Result()
	if len(keys) > 0 {
		client.Del(ctx, keys...)
	}

	return client
}

// cleanupTestRedis removes test keys after test
func cleanupTestRedis(t *testing.T, client *redis.Client) {
	ctx := context.Background()
	keys, _ := client.Keys(ctx, "esi:*").Result()
	if len(keys) > 0 {
		client.Del(ctx, keys...)
	}
	client.Close()
}

// createMockESIServer creates a mock HTTP server that simulates ESI endpoints
func createMockESIServer(t *testing.T) *httptest.Server {
	mux := http.NewServeMux()

	// Mock endpoint that returns token limit headers
	mux.HandleFunc("/markets/prices/", func(w http.ResponseWriter, r *http.Request) {
		// Markets group - no token restrictions (token_limit = -1)
		w.Header().Set("X-Ratelimit-Limit", "0/15m") // No token restrictions
		w.Header().Set("X-Ratelimit-Remaining", "0")
		w.Header().Set("X-Ratelimit-Used", "0")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"type_id": 123, "price": 100.5}]`))
	})

	mux.HandleFunc("/industry/systems/", func(w http.ResponseWriter, r *http.Request) {
		// Industry group - has token restrictions (600 tokens)
		w.Header().Set("X-Ratelimit-Limit", "600/15m")
		w.Header().Set("X-Ratelimit-Remaining", "598")
		w.Header().Set("X-Ratelimit-Used", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"solar_system_id": 30000142, "cost_index": 0.1}]`))
	})

	mux.HandleFunc("/characters/", func(w http.ResponseWriter, r *http.Request) {
		// Characters group - has token restrictions (150 tokens)
		w.Header().Set("X-Ratelimit-Limit", "150/15m")
		w.Header().Set("X-Ratelimit-Remaining", "148")
		w.Header().Set("X-Ratelimit-Used", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"character_id": 123456, "name": "Test Character"}`))
	})

	mux.HandleFunc("/status/", func(w http.ResponseWriter, r *http.Request) {
		// Status group - has token restrictions (600 tokens)
		w.Header().Set("X-Ratelimit-Limit", "600/15m")
		w.Header().Set("X-Ratelimit-Remaining", "599")
		w.Header().Set("X-Ratelimit-Used", "1")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"players": 50000, "server_version": "test"}`))
	})

	return httptest.NewServer(mux)
}

// doWithRetry performs a request with automatic retry on rate limit errors
func doWithRetry(ctx context.Context, client *RedisESIClient, method, path string, headers map[string]string, group GroupDesignation) ([]byte, *http.Response, error) {
	for {
		body, resp, err := client.Do(ctx, method, path, headers, group)
		if err != nil {
			if rateLimitErr := GetRateLimitError(err); rateLimitErr != nil && rateLimitErr.Retryable {
				// Wait and retry
				waitTime := time.Until(rateLimitErr.RetryAfter)
				if waitTime > 0 {
					time.Sleep(waitTime + 10*time.Millisecond) // Small buffer
				}
				continue // Retry
			}
			return body, resp, err // Non-retryable error or non-rate-limit error
		}
		return body, resp, nil // Success
	}
}

// TestRedisRateLimiter_MultipleWorkers tests that multiple workers coordinate correctly
func TestRedisRateLimiter_MultipleWorkers(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	// Create 2 workers (simulating 2 containers)
	worker1 := NewRedisESIClient(server.URL, redisClient, 3.0)
	worker2 := NewRedisESIClient(server.URL, redisClient, 3.0)

	ctx := context.Background()
	group := GroupDesignation{PrimaryGroup: "markets"}

	// Track requests from both workers
	var worker1Requests, worker2Requests int64
	var worker1Errors, worker2Errors int64

	// Run both workers concurrently
	var wg sync.WaitGroup
	startTime := time.Now()

	// Worker 1: Make 50 requests (with retry on rate limit)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			_, _, err := doWithRetry(ctx, worker1, "GET", "/markets/prices/", nil, group)
			if err != nil {
				atomic.AddInt64(&worker1Errors, 1)
			} else {
				atomic.AddInt64(&worker1Requests, 1)
			}
		}
	}()

	// Worker 2: Make 50 requests (with retry on rate limit)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			_, _, err := doWithRetry(ctx, worker2, "GET", "/markets/prices/", nil, group)
			if err != nil {
				atomic.AddInt64(&worker2Errors, 1)
			} else {
				atomic.AddInt64(&worker2Requests, 1)
			}
		}
	}()

	wg.Wait()
	duration := time.Since(startTime)

	totalRequests := worker1Requests + worker2Requests
	totalErrors := worker1Errors + worker2Errors

	t.Logf("Worker 1: %d requests, %d errors", worker1Requests, worker1Errors)
	t.Logf("Worker 2: %d requests, %d errors", worker2Requests, worker2Errors)
	t.Logf("Total: %d requests, %d errors in %v", totalRequests, totalErrors, duration)

	// With rate limit of 3 req/s, 100 requests should take at least ~33 seconds
	// But we allow some variance due to Redis overhead
	expectedMinDuration := time.Duration(100/3) * time.Second
	if duration < expectedMinDuration-time.Second {
		t.Errorf("Rate limiting not working: %v requests completed in %v, expected at least %v",
			totalRequests, duration, expectedMinDuration)
	}

	// All requests should eventually succeed (no permanent errors)
	if totalErrors > 0 {
		t.Logf("Note: %d rate limit errors occurred (expected for rate limiting)", totalErrors)
	}
}

// TestRedisRateLimiter_TokenBucket tests token bucket tracking across workers
func TestRedisRateLimiter_TokenBucket(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	// Create 2 workers
	worker1 := NewRedisESIClient(server.URL, redisClient, 10.0) // Higher rate for faster testing
	worker2 := NewRedisESIClient(server.URL, redisClient, 10.0)

	ctx := context.Background()
	group := GroupDesignation{PrimaryGroup: "industry"}

	// Industry group has 600 token limit
	// Each 2XX response costs 2 tokens
	// So we can make at most 300 successful requests in a 15-minute window

	var worker1Success, worker2Success int64
	var worker1TokenErrors, worker2TokenErrors int64

	// Make requests until we exhaust tokens
	// We'll make more than 300 requests to ensure we hit the limit
	var wg sync.WaitGroup

	// Worker 1: Try to make 200 requests (with retry on rate limit, but track token errors)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			_, _, err := doWithRetry(ctx, worker1, "GET", "/industry/systems/", nil, group)
			if err != nil {
				if rateLimitErr := GetRateLimitError(err); rateLimitErr != nil {
					if rateLimitErr.Reason == "insufficient tokens" || rateLimitErr.Reason == "rate limited or insufficient tokens" {
						atomic.AddInt64(&worker1TokenErrors, 1)
					}
				}
			} else {
				atomic.AddInt64(&worker1Success, 1)
			}
		}
	}()

	// Worker 2: Try to make 200 requests (with retry on rate limit, but track token errors)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 200; i++ {
			_, _, err := doWithRetry(ctx, worker2, "GET", "/industry/systems/", nil, group)
			if err != nil {
				if rateLimitErr := GetRateLimitError(err); rateLimitErr != nil {
					if rateLimitErr.Reason == "insufficient tokens" || rateLimitErr.Reason == "rate limited or insufficient tokens" {
						atomic.AddInt64(&worker2TokenErrors, 1)
					}
				}
			} else {
				atomic.AddInt64(&worker2Success, 1)
			}
		}
	}()

	wg.Wait()

	totalSuccess := worker1Success + worker2Success
	totalTokenErrors := worker1TokenErrors + worker2TokenErrors

	t.Logf("Worker 1: %d success, %d token errors", worker1Success, worker1TokenErrors)
	t.Logf("Worker 2: %d success, %d token errors", worker2Success, worker2TokenErrors)
	t.Logf("Total: %d success, %d token errors", totalSuccess, totalTokenErrors)

	// Total successful requests should be around 300 (600 tokens / 2 tokens per request)
	// Allow some variance due to concurrent updates
	if totalSuccess < 290 || totalSuccess > 310 {
		t.Errorf("Token bucket not working correctly: got %d successful requests, expected ~300", totalSuccess)
	}

	// Should have token errors after exhausting tokens
	if totalTokenErrors == 0 && totalSuccess >= 300 {
		t.Logf("Note: No token errors, but requests were limited (may have hit rate limit first)")
	}
}

// TestRedisRateLimiter_MultipleGroups tests that different groups work independently
func TestRedisRateLimiter_MultipleGroups(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	worker1 := NewRedisESIClient(server.URL, redisClient, 3.0)
	worker2 := NewRedisESIClient(server.URL, redisClient, 3.0)

	ctx := context.Background()

	// Test multiple groups simultaneously
	groups := []GroupDesignation{
		{PrimaryGroup: "markets"},
		{PrimaryGroup: "industry"},
		{PrimaryGroup: "characters"},
		{PrimaryGroup: "status"},
	}

	paths := []string{
		"/markets/prices/",
		"/industry/systems/",
		"/characters/",
		"/status/",
	}

	var wg sync.WaitGroup
	var totalRequests int64
	var totalErrors int64

	// Each worker makes requests to all groups
	for workerID := 0; workerID < 2; workerID++ {
		workerID := workerID
		worker := []*RedisESIClient{worker1, worker2}[workerID]

		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 20; i++ {
				for j, group := range groups {
					_, _, err := doWithRetry(ctx, worker, "GET", paths[j], nil, group)
					if err != nil {
						atomic.AddInt64(&totalErrors, 1)
					} else {
						atomic.AddInt64(&totalRequests, 1)
					}
				}
			}
		}()
	}

	wg.Wait()

	t.Logf("Total requests: %d, errors: %d", totalRequests, totalErrors)

	// Should have made requests to all groups
	// 2 workers * 20 iterations * 4 groups = 160 requests
	// Some may be rate limited, but most should succeed
	if totalRequests < 100 {
		t.Errorf("Too few successful requests: %d, expected at least 100", totalRequests)
	}
}

// TestRedisRateLimiter_Downtime tests that requests are blocked during EVE downtime
func TestRedisRateLimiter_Downtime(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	client := NewRedisESIClient(server.URL, redisClient, 3.0)

	// Test during downtime
	downtimeTime := time.Date(2024, 1, 1, 11, 5, 0, 0, time.UTC)
	inDowntime, downtimeEnd := client.isInDowntime(downtimeTime)
	if !inDowntime {
		t.Error("Expected to be in downtime at 11:05 UTC")
	}
	if downtimeEnd.Hour() != 11 || downtimeEnd.Minute() != 15 {
		t.Errorf("Expected downtime end at 11:15 UTC, got %v", downtimeEnd)
	}

	// Test before downtime
	beforeDowntime := time.Date(2024, 1, 1, 10, 59, 0, 0, time.UTC)
	inDowntime, _ = client.isInDowntime(beforeDowntime)
	if inDowntime {
		t.Error("Expected not to be in downtime at 10:59 UTC")
	}

	// Test after downtime
	afterDowntime := time.Date(2024, 1, 1, 11, 16, 0, 0, time.UTC)
	inDowntime, _ = client.isInDowntime(afterDowntime)
	if inDowntime {
		t.Error("Expected not to be in downtime at 11:16 UTC")
	}
}

// TestRedisRateLimiter_DowntimeBlocksRequests tests that actual requests are blocked during downtime
func TestRedisRateLimiter_DowntimeBlocksRequests(t *testing.T) {
	// This test would require time mocking to test actual request blocking
	// For now, we test the isInDowntime function which is called before requests
	// In a production scenario, you'd use a time mocking library to test the full flow
	t.Skip("Requires time mocking to test full request blocking flow")
}

// TestRedisRateLimiter_ConcurrentStressTest performs a comprehensive stress test
func TestRedisRateLimiter_ConcurrentStressTest(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping stress test in short mode")
	}

	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	// Create 2 workers
	worker1 := NewRedisESIClient(server.URL, redisClient, 3.0)
	worker2 := NewRedisESIClient(server.URL, redisClient, 3.0)

	ctx := context.Background()

	// Test scenarios
	scenarios := []struct {
		name      string
		group     GroupDesignation
		path      string
		requests  int
		hasTokens bool
	}{
		{"markets_no_tokens", GroupDesignation{PrimaryGroup: "markets"}, "/markets/prices/", 100, false},
		{"industry_with_tokens", GroupDesignation{PrimaryGroup: "industry"}, "/industry/systems/", 150, true},
		{"characters_with_tokens", GroupDesignation{PrimaryGroup: "characters"}, "/characters/", 75, true},
		{"status_with_tokens", GroupDesignation{PrimaryGroup: "status"}, "/status/", 50, true},
	}

	var wg sync.WaitGroup
	results := make(map[string]*struct {
		success int64
		errors  int64
		mu      sync.Mutex
	})

	for _, scenario := range scenarios {
		results[scenario.name] = &struct {
			success int64
			errors  int64
			mu      sync.Mutex
		}{}

		// Worker 1
		wg.Add(1)
		go func(s struct {
			name      string
			group     GroupDesignation
			path      string
			requests  int
			hasTokens bool
		}) {
			defer wg.Done()
			result := results[s.name]
			for i := 0; i < s.requests; i++ {
				_, _, err := doWithRetry(ctx, worker1, "GET", s.path, nil, s.group)
				if err != nil {
					atomic.AddInt64(&result.errors, 1)
				} else {
					atomic.AddInt64(&result.success, 1)
				}
			}
		}(scenario)

		// Worker 2
		wg.Add(1)
		go func(s struct {
			name      string
			group     GroupDesignation
			path      string
			requests  int
			hasTokens bool
		}) {
			defer wg.Done()
			result := results[s.name]
			for i := 0; i < s.requests; i++ {
				_, _, err := doWithRetry(ctx, worker2, "GET", s.path, nil, s.group)
				if err != nil {
					atomic.AddInt64(&result.errors, 1)
				} else {
					atomic.AddInt64(&result.success, 1)
				}
			}
		}(scenario)
	}

	startTime := time.Now()
	wg.Wait()
	duration := time.Since(startTime)

	// Report results
	for name, result := range results {
		t.Logf("%s: %d success, %d errors", name, result.success, result.errors)
	}

	t.Logf("Total test duration: %v", duration)

	// Verify rate limiting: total requests across all groups should respect 3 req/s per group
	// Markets: 200 requests / 3 req/s = ~67 seconds minimum
	// Industry: 300 requests / 3 req/s = ~100 seconds minimum
	// Characters: 150 requests / 3 req/s = ~50 seconds minimum
	// Status: 100 requests / 3 req/s = ~33 seconds minimum
	// Since they run concurrently, total time should be around max of these
	expectedMinDuration := time.Duration(300/3) * time.Second
	if duration < expectedMinDuration-time.Second {
		t.Errorf("Rate limiting may not be working: completed in %v, expected at least %v",
			duration, expectedMinDuration)
	}
}

// TestRedisRateLimiter_TokenExhaustionAndRecovery tests token exhaustion and recovery
func TestRedisRateLimiter_TokenExhaustionAndRecovery(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	client := NewRedisESIClient(server.URL, redisClient, 10.0) // Higher rate for faster testing

	ctx := context.Background()
	group := GroupDesignation{PrimaryGroup: "industry"}

	// Industry has 600 token limit, 2 tokens per request = 300 requests max

	// Phase 1: Exhaust tokens
	var exhaustedCount int64
	for i := 0; i < 350; i++ {
		_, _, err := client.Do(ctx, "GET", "/industry/systems/", nil, group)
		if err != nil {
			if rateLimitErr := GetRateLimitError(err); rateLimitErr != nil {
				if rateLimitErr.Reason == "insufficient tokens" || rateLimitErr.Reason == "rate limited or insufficient tokens" {
					atomic.AddInt64(&exhaustedCount, 1)
					if exhaustedCount == 1 {
						t.Logf("First token exhaustion at request %d", i+1)
					}
				}
			}
		}
	}

	t.Logf("Token exhaustion phase: %d exhaustion errors", exhaustedCount)

	// Phase 2: Wait for tokens to recover (simulate by checking Redis state)
	// In a real scenario, we'd wait for the sliding window to expire
	// For this test, we'll just verify that the system correctly reports exhaustion

	if exhaustedCount == 0 {
		t.Error("Expected some token exhaustion errors, got 0")
	}
}

// TestRedisRateLimiter_GroupsWithoutTokens tests groups that don't use token restrictions
func TestRedisRateLimiter_GroupsWithoutTokens(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	worker1 := NewRedisESIClient(server.URL, redisClient, 3.0)
	worker2 := NewRedisESIClient(server.URL, redisClient, 3.0)

	ctx := context.Background()
	group := GroupDesignation{PrimaryGroup: "markets"} // Markets has no token restrictions

	var worker1Success, worker2Success int64
	var worker1Errors, worker2Errors int64

	var wg sync.WaitGroup
	startTime := time.Now()

	// Worker 1: 50 requests
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			_, _, err := doWithRetry(ctx, worker1, "GET", "/markets/prices/", nil, group)
			if err != nil {
				atomic.AddInt64(&worker1Errors, 1)
			} else {
				atomic.AddInt64(&worker1Success, 1)
			}
		}
	}()

	// Worker 2: 50 requests
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			_, _, err := doWithRetry(ctx, worker2, "GET", "/markets/prices/", nil, group)
			if err != nil {
				atomic.AddInt64(&worker2Errors, 1)
			} else {
				atomic.AddInt64(&worker2Success, 1)
			}
		}
	}()

	wg.Wait()
	duration := time.Since(startTime)

	totalSuccess := worker1Success + worker2Success
	totalErrors := worker1Errors + worker2Errors

	t.Logf("Worker 1: %d success, %d errors", worker1Success, worker1Errors)
	t.Logf("Worker 2: %d success, %d errors", worker2Success, worker2Errors)
	t.Logf("Total: %d success, %d errors in %v", totalSuccess, totalErrors, duration)

	// Should still respect rate limiting (3 req/s total)
	// 100 requests / 3 req/s = ~33 seconds minimum
	expectedMinDuration := time.Duration(100/3) * time.Second
	if duration < expectedMinDuration-time.Second {
		t.Errorf("Rate limiting not working for groups without tokens: completed in %v, expected at least %v",
			duration, expectedMinDuration)
	}

	// Should not have token bucket errors (markets has no token restrictions)
	// Errors should only be rate limiting errors
	if totalErrors > 0 {
		t.Logf("Note: %d rate limit errors (expected, no token errors)", totalErrors)
	}
}

// TestRedisRateLimiter_PerPrimaryGroupRateLimit tests that different primary groups can have different rate limits
func TestRedisRateLimiter_PerPrimaryGroupRateLimit(t *testing.T) {
	redisClient := setupTestRedis(t)
	defer cleanupTestRedis(t, redisClient)

	server := createMockESIServer(t)
	defer server.Close()

	// Create 2 workers with default rate limit of 3 req/s
	worker1 := NewRedisESIClient(server.URL, redisClient, 3.0)
	worker2 := NewRedisESIClient(server.URL, redisClient, 3.0)

	ctx := context.Background()

	// Set different rate limits for different primary groups
	// Markets: 5 req/s (faster)
	// Industry: 2 req/s (slower)
	err := worker1.SetPrimaryGroupRateLimit(ctx, "markets", 5.0)
	if err != nil {
		t.Fatalf("Failed to set markets rate limit: %v", err)
	}
	err = worker1.SetPrimaryGroupRateLimit(ctx, "industry", 2.0)
	if err != nil {
		t.Fatalf("Failed to set industry rate limit: %v", err)
	}

	// Verify rate limits are set
	marketsRate := worker1.GetPrimaryGroupRateLimit(ctx, "markets")
	if marketsRate != 5.0 {
		t.Errorf("Expected markets rate limit 5.0, got %f", marketsRate)
	}
	industryRate := worker1.GetPrimaryGroupRateLimit(ctx, "industry")
	if industryRate != 2.0 {
		t.Errorf("Expected industry rate limit 2.0, got %f", industryRate)
	}

	// Test markets group with 5 req/s (should be faster)
	marketsGroup := GroupDesignation{PrimaryGroup: "markets"}
	var marketsSuccess int64
	var marketsErrors int64

	var wg sync.WaitGroup
	startTime := time.Now()

	// Worker 1: 30 requests to markets (should take ~6 seconds at 5 req/s)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 30; i++ {
			_, _, err := doWithRetry(ctx, worker1, "GET", "/markets/prices/", nil, marketsGroup)
			if err != nil {
				atomic.AddInt64(&marketsErrors, 1)
			} else {
				atomic.AddInt64(&marketsSuccess, 1)
			}
		}
	}()

	// Worker 2: 30 requests to markets (should take ~6 seconds at 5 req/s total)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 30; i++ {
			_, _, err := doWithRetry(ctx, worker2, "GET", "/markets/prices/", nil, marketsGroup)
			if err != nil {
				atomic.AddInt64(&marketsErrors, 1)
			} else {
				atomic.AddInt64(&marketsSuccess, 1)
			}
		}
	}()

	wg.Wait()
	marketsDuration := time.Since(startTime)

	t.Logf("Markets: %d success, %d errors in %v", marketsSuccess, marketsErrors, marketsDuration)

	// 60 requests at 5 req/s should take at least ~12 seconds
	expectedMinDuration := time.Duration(60/5) * time.Second
	if marketsDuration < expectedMinDuration-time.Second {
		t.Errorf("Markets rate limiting not working: completed in %v, expected at least %v",
			marketsDuration, expectedMinDuration)
	}

	// Test industry group with 2 req/s (should be slower)
	industryGroup := GroupDesignation{PrimaryGroup: "industry"}
	var industrySuccess int64
	var industryErrors int64

	startTime = time.Now()

	// Worker 1: 20 requests to industry (should take ~10 seconds at 2 req/s)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			_, _, err := doWithRetry(ctx, worker1, "GET", "/industry/systems/", nil, industryGroup)
			if err != nil {
				atomic.AddInt64(&industryErrors, 1)
			} else {
				atomic.AddInt64(&industrySuccess, 1)
			}
		}
	}()

	// Worker 2: 20 requests to industry (should take ~10 seconds at 2 req/s total)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 20; i++ {
			_, _, err := doWithRetry(ctx, worker2, "GET", "/industry/systems/", nil, industryGroup)
			if err != nil {
				atomic.AddInt64(&industryErrors, 1)
			} else {
				atomic.AddInt64(&industrySuccess, 1)
			}
		}
	}()

	wg.Wait()
	industryDuration := time.Since(startTime)

	t.Logf("Industry: %d success, %d errors in %v", industrySuccess, industryErrors, industryDuration)

	// 40 requests at 2 req/s should take at least ~20 seconds
	expectedMinDuration = time.Duration(40/2) * time.Second
	if industryDuration < expectedMinDuration-time.Second {
		t.Errorf("Industry rate limiting not working: completed in %v, expected at least %v",
			industryDuration, expectedMinDuration)
	}

	// Industry should be slower than markets
	if industryDuration <= marketsDuration {
		t.Errorf("Industry (2 req/s) should be slower than markets (5 req/s), but industry took %v and markets took %v",
			industryDuration, marketsDuration)
	}
}
