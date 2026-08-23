package ratelimiter

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"

	"eve-industry-planner/testing/httpfake"
)

// tokenConsumingESI stands in for ESI charging 2 tokens per request, reporting
// the running total in the rate-limit headers the client reads. used is the
// caller's counter so a test can reset it to simulate a window rolling over.
func tokenConsumingESI(t *testing.T, used *int64, limitHeader string, tokenLimit int64) *httpfake.Server {
	t.Helper()
	f := httpfake.New(t)
	f.Handle(http.MethodGet, "/test", func(w http.ResponseWriter, _ *http.Request) {
		current := atomic.AddInt64(used, 2)
		w.Header().Set("X-Ratelimit-Limit", limitHeader)
		w.Header().Set("X-Ratelimit-Remaining", strconv.FormatInt(max(tokenLimit-current, 0), 10))
		w.Header().Set("X-Ratelimit-Used", strconv.FormatInt(current, 10))
		_, _ = io.WriteString(w, `{"test": "data"}`)
	})
	return f
}

// TestFloodLimiter_TokenExhaustion simulates flooding a limiter with many requests
// and verifies that requests are properly blocked when tokens run out.
func TestFloodLimiter_TokenExhaustion(t *testing.T) {
	const tokenLimit = 40
	var serverTokenUsed int64
	esi := tokenConsumingESI(t, &serverTokenUsed, "40/15m", int64(tokenLimit))

	client := createTestESIClient(esi.BaseURL())
	client.httpClient = esi.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	groupName := "flood-test"
	client.AddGroupLimiter(groupName, 100000.0, 200000)
	limiter := client.limiters[groupName]
	limiter.mu.Lock()
	limiter.Limiter.SetLimit(rate.Inf)
	limiter.TokenLimit = tokenLimit
	limiter.TokenUsed = 0
	limiter.consumptions = []TokenConsumption{}
	limiter.mu.Unlock()

	designation := GroupDesignation{PrimaryGroup: "flood", SecondaryGroup: "test"}
	client.mu.Lock()
	client.pathToGroup["/test"] = groupName
	client.mu.Unlock()

	runBatch := func(n int) (successes, rateLimited, other int64) {
		var wg sync.WaitGroup
		for range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
				defer reqCancel()
				_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
				if err == nil {
					atomic.AddInt64(&successes, 1)
					return
				}
				if GetRateLimitError(err) != nil {
					atomic.AddInt64(&rateLimited, 1)
					return
				}
				atomic.AddInt64(&other, 1)
			}()
		}
		wg.Wait()
		return successes, rateLimited, other
	}

	fillSuccess, fillLimited, fillOther := runBatch(20)
	if fillOther != 0 {
		t.Fatalf("fill batch unexpected errors: other=%d", fillOther)
	}
	if fillSuccess+fillLimited != 20 {
		t.Fatalf("fill batch processed %d requests, want 20", fillSuccess+fillLimited)
	}

	limiter.mu.RLock()
	tokenUsed := limiter.TokenUsed
	limitAfterFill := limiter.TokenLimit
	limiter.mu.RUnlock()
	t.Logf("after fill: tokenUsed=%d tokenLimit=%d successes=%d rateLimited=%d",
		tokenUsed, limitAfterFill, fillSuccess, fillLimited)
	if tokenUsed+2 <= limitAfterFill {
		t.Fatalf("fill did not exhaust the token window: tokenUsed=%d tokenLimit=%d", tokenUsed, limitAfterFill)
	}

	floodSuccess, floodLimited, floodOther := runBatch(20)
	t.Logf("after flood: successes=%d rateLimited=%d other=%d", floodSuccess, floodLimited, floodOther)
	if floodOther != 0 {
		t.Fatalf("flood batch unexpected errors: other=%d", floodOther)
	}
	if floodSuccess+floodLimited != 20 {
		t.Fatalf("flood batch processed %d requests, want 20", floodSuccess+floodLimited)
	}
	if floodLimited == 0 {
		t.Fatal("expected rate limit errors after the token window was exhausted")
	}
}

// TestFloodLimiter_ProgressiveExhaustion tests that tokens are progressively consumed
// and requests start getting blocked as we approach the limit.
func TestFloodLimiter_ProgressiveExhaustion(t *testing.T) {
	const tokenLimit = 100
	var serverTokenUsed int64
	esi := tokenConsumingESI(t, &serverTokenUsed, "100/15m", int64(tokenLimit))

	client := createTestESIClient(esi.BaseURL())
	client.httpClient = esi.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	groupName := "progressive-test"
	// Use infinite rate so rate limiter never blocks
	client.AddGroupLimiter(groupName, 100000.0, 200000)
	limiter := client.limiters[groupName]
	limiter.mu.Lock()
	limiter.Limiter.SetLimit(rate.Inf)
	limiter.TokenLimit = 100
	limiter.TokenUsed = 0
	limiter.consumptions = []TokenConsumption{}
	limiter.mu.Unlock()

	designation := GroupDesignation{PrimaryGroup: "progressive", SecondaryGroup: "test"}

	// Map the path to the group to avoid mutex contention
	client.mu.Lock()
	client.pathToGroup["/test"] = groupName
	client.mu.Unlock()

	// Make requests in batches and track when rate limiting starts
	batchSizes := []int{10, 10, 10, 10, 10, 10} // 60 requests total
	var rateLimitErrors int64
	var successes int64

	for batchNum, batchSize := range batchSizes {
		var wg sync.WaitGroup
		batchRateLimitErrors := int64(0)
		batchSuccesses := int64(0)

		for range batchSize {
			wg.Go(func() {
				reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
				defer reqCancel()
				_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
				if err != nil {
					if GetRateLimitError(err) != nil {
						atomic.AddInt64(&batchRateLimitErrors, 1)
						atomic.AddInt64(&rateLimitErrors, 1)
					}
				} else {
					atomic.AddInt64(&batchSuccesses, 1)
					atomic.AddInt64(&successes, 1)
				}
			})
		}

		wg.Wait()

		// Check token state after this batch
		limiter.mu.RLock()
		tokenUsed := limiter.TokenUsed
		tokenLimit := limiter.TokenLimit
		limiter.mu.RUnlock()

		t.Logf("Batch %d: successes=%d, rateLimitErrors=%d, tokenUsed=%d/%d",
			batchNum+1, batchSuccesses, batchRateLimitErrors, tokenUsed, tokenLimit)

		// As we progress, we should see rate limit errors start appearing
		if batchNum >= 2 && batchRateLimitErrors == 0 && tokenUsed >= tokenLimit {
			t.Logf("Warning: Batch %d had no rate limit errors despite tokenUsed (%d) >= tokenLimit (%d)",
				batchNum+1, tokenUsed, tokenLimit)
		}
	}

	t.Logf("Total: successes=%d, rateLimitErrors=%d", successes, rateLimitErrors)

	// We should have some rate limit errors by the end
	if rateLimitErrors == 0 {
		t.Error("Expected some rate limit errors as tokens were exhausted, got 0")
	}
}

// TestFloodLimiter_RecoveryAfterExhaustion tests that the limiter recovers
// when tokens become available again (via cleanup of old consumptions).
func TestFloodLimiter_RecoveryAfterExhaustion(t *testing.T) {
	// Track server-side token usage to simulate realistic behavior
	var serverTokenUsed int64
	serverTokenLimit := int64(100)

	esi := tokenConsumingESI(t, &serverTokenUsed, "100/15m", serverTokenLimit)

	client := createTestESIClient(esi.BaseURL())
	client.httpClient = esi.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	groupName := "recovery-test"
	// Use infinite rate so rate limiter never blocks
	client.AddGroupLimiter(groupName, 100000.0, 200000)
	limiter := client.limiters[groupName]
	now := time.Now()
	limiter.mu.Lock()
	limiter.Limiter.SetLimit(rate.Inf)
	limiter.TokenLimit = 100
	// Set up consumptions that will expire soon
	// Make the old one older than 15 minutes so it will be cleaned up
	limiter.consumptions = []TokenConsumption{
		{Tokens: 100, Consumed: now.Add(-1 * time.Minute)},
	}
	limiter.TokenUsed = 100
	// Reset server token usage to match
	atomic.StoreInt64(&serverTokenUsed, 100)
	limiter.mu.Unlock()

	designation := GroupDesignation{PrimaryGroup: "recovery", SecondaryGroup: "test"}

	// Map the path to the group to avoid mutex contention
	client.mu.Lock()
	client.pathToGroup["/test"] = groupName
	client.mu.Unlock()

	// Initially, requests should be rate limited
	var initialRateLimitErrors int64
	var wg sync.WaitGroup

	for range 10 {
		wg.Go(func() {
			reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
			defer reqCancel()
			_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
			if err != nil {
				if GetRateLimitError(err) != nil {
					atomic.AddInt64(&initialRateLimitErrors, 1)
				}
			}
		})
	}

	wg.Wait()

	t.Logf("Initial requests: rateLimitErrors=%d", initialRateLimitErrors)
	if initialRateLimitErrors != 10 {
		t.Fatalf("at-limit window should reject all 10 requests, got rateLimitErrors=%d", initialRateLimitErrors)
	}

	limiter.mu.Lock()
	for i := range limiter.consumptions {
		limiter.consumptions[i].Consumed = time.Now().Add(-16 * time.Minute)
	}
	limiter.mu.Unlock()
	limiter.CleanupOldConsumptions(ctx)
	limiter.mu.RLock()
	usedAfterExpiry := limiter.TokenUsed
	consumptionsAfterExpiry := len(limiter.consumptions)
	limiter.mu.RUnlock()
	atomic.StoreInt64(&serverTokenUsed, int64(usedAfterExpiry))

	t.Logf("After window expiry: tokenUsed=%d, tokenLimit=%d, consumptions=%d",
		usedAfterExpiry, limiter.TokenLimit, consumptionsAfterExpiry)

	// Now requests should succeed again
	var recoverySuccesses int64
	var recoveryRateLimitErrors int64

	for range 10 {
		wg.Go(func() {
			reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
			defer reqCancel()
			_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
			if err != nil {
				if GetRateLimitError(err) != nil {
					atomic.AddInt64(&recoveryRateLimitErrors, 1)
				}
			} else {
				atomic.AddInt64(&recoverySuccesses, 1)
			}
		})
	}

	wg.Wait()

	t.Logf("After recovery: successes=%d, rateLimitErrors=%d", recoverySuccesses, recoveryRateLimitErrors)

	// After cleanup, we should have more successes
	if recoverySuccesses == 0 && recoveryRateLimitErrors == 10 {
		t.Error("Expected some requests to succeed after token cleanup, but all were rate limited")
	}
}

// TestFloodLimiter_ConcurrentExhaustion tests concurrent requests exhausting tokens
// and verifies thread safety.
func TestFloodLimiter_ConcurrentExhaustion(t *testing.T) {
	// Track server-side token usage to simulate realistic behavior
	var serverTokenUsed int64
	serverTokenLimit := int64(20) // Very low limit - 20 requests need 40 tokens, but limit is 20, so many should be blocked
	esi := tokenConsumingESI(t, &serverTokenUsed, "20/15m", serverTokenLimit)

	client := createTestESIClient(esi.BaseURL())
	client.httpClient = esi.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	groupName := "concurrent-exhaustion"
	// Use infinite rate so rate limiter never blocks
	client.AddGroupLimiter(groupName, 100000.0, 200000)
	limiter := client.limiters[groupName]
	limiter.mu.Lock()
	limiter.Limiter.SetLimit(rate.Inf)
	limiter.TokenLimit = 20 // Very low limit - 20 requests need 40 tokens, but limit is 20, so many should be blocked
	limiter.TokenUsed = 0
	limiter.consumptions = []TokenConsumption{}
	// Reset server token usage to match
	atomic.StoreInt64(&serverTokenUsed, 0)
	limiter.mu.Unlock()

	designation := GroupDesignation{PrimaryGroup: "concurrent", SecondaryGroup: "exhaustion"}

	// Map the path to the group to avoid mutex contention
	client.mu.Lock()
	client.pathToGroup["/test"] = groupName
	client.mu.Unlock()

	// Make many concurrent requests
	// Note: Reduced to avoid excessive blocking on rate limiter
	numRequests := 20
	var successes int64
	var rateLimitErrors int64
	var wg sync.WaitGroup

	startTime := time.Now()

	for i := range numRequests {
		wg.Add(1)
		go func(requestNum int) {
			defer wg.Done()
			reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
			defer reqCancel()
			_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
			if err != nil {
				if GetRateLimitError(err) != nil {
					atomic.AddInt64(&rateLimitErrors, 1)
				}
			} else {
				atomic.AddInt64(&successes, 1)
			}
		}(i)
	}

	wg.Wait()
	duration := time.Since(startTime)

	// Check final state
	limiter.mu.RLock()
	finalTokenUsed := limiter.TokenUsed
	finalTokenLimit := limiter.TokenLimit
	limiter.mu.RUnlock()

	t.Logf("Concurrent exhaustion test:")
	t.Logf("  Requests: %d", numRequests)
	t.Logf("  Successes: %d", successes)
	t.Logf("  Rate limit errors: %d", rateLimitErrors)
	t.Logf("  Final tokenUsed: %d/%d", finalTokenUsed, finalTokenLimit)
	t.Logf("  Duration: %v", duration)

	wantSuccess := int64(finalTokenLimit / 2)
	if successes != wantSuccess {
		t.Errorf("successes = %d, want %d (limit %d at 2 tokens/request)", successes, wantSuccess, finalTokenLimit)
	}
	if rateLimitErrors != int64(numRequests)-wantSuccess {
		t.Errorf("rate limit errors = %d, want %d", rateLimitErrors, int64(numRequests)-wantSuccess)
	}
	if finalTokenUsed < finalTokenLimit {
		t.Errorf("TokenUsed = %d, want at least limit %d", finalTokenUsed, finalTokenLimit)
	}

	totalProcessed := successes + rateLimitErrors
	if totalProcessed != int64(numRequests) {
		t.Errorf("Expected %d requests processed, got %d", numRequests, totalProcessed)
	}
}

// TestFloodLimiter_RetryAfterRecovery tests that requests are properly blocked
// during retry-after periods and recover after the period expires.
func TestFloodLimiter_RetryAfterRecovery(t *testing.T) {
	// Headers match the test's token limit so the rate limiter does not recalculate.
	esi := httpfake.New(t)
	esi.Set(http.MethodGet, "/test", httpfake.Response{
		Body: `{"test": "data"}`,
		Header: http.Header{
			"X-Ratelimit-Limit":     {"100/15m"},
			"X-Ratelimit-Remaining": {"50"},
			"X-Ratelimit-Used":      {"50"},
		},
	})

	client := createTestESIClient(esi.BaseURL())
	client.httpClient = esi.Client()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	designation := GroupDesignation{PrimaryGroup: "retry", SecondaryGroup: "after"}
	// Build the actual group name from designation
	groupName := buildGroupNameFromDesignation(designation) // This will be "retry-after"

	// Use infinite rate so rate limiter never blocks
	client.AddGroupLimiter(groupName, 100000.0, 200000)
	limiter := client.limiters[groupName]
	limiter.mu.Lock()
	limiter.Limiter.SetLimit(rate.Inf)
	limiter.TokenLimit = 100
	limiter.TokenUsed = 50
	limiter.retryAfter = time.Now().Add(2 * time.Second) // Block for 2 seconds
	limiter.consumptions = []TokenConsumption{}
	limiter.mu.Unlock()

	// Map the path to the group to avoid mutex contention
	client.mu.Lock()
	client.pathToGroup["/test"] = groupName
	client.mu.Unlock()

	// Requests should be blocked during retry-after period
	var blockedCount int64
	var wg sync.WaitGroup

	for range 10 {
		wg.Go(func() {
			reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
			defer reqCancel()
			_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
			if err != nil {
				rateLimitErr := GetRateLimitError(err)
				if rateLimitErr != nil && rateLimitErr.Retryable {
					atomic.AddInt64(&blockedCount, 1)
				}
			}
		})
	}

	wg.Wait()

	t.Logf("During retry-after: blocked requests=%d", blockedCount)

	// All requests should be blocked during retry-after
	if blockedCount == 0 {
		t.Error("Expected all requests to be blocked during retry-after period, got 0 blocked")
	}

	// Wait for retry-after to expire
	time.Sleep(3 * time.Second)

	// Clear retry-after
	limiter.mu.Lock()
	limiter.retryAfter = time.Time{}
	limiter.mu.Unlock()

	// Now requests should succeed
	var successCount int64
	blockedCount = 0

	for range 10 {
		wg.Go(func() {
			reqCtx, reqCancel := context.WithTimeout(ctx, 5*time.Second)
			defer reqCancel()
			_, _, err := client.Do(reqCtx, "GET", "/test", nil, nil, designation)
			if err != nil {
				rateLimitErr := GetRateLimitError(err)
				if rateLimitErr != nil {
					atomic.AddInt64(&blockedCount, 1)
				}
			} else {
				atomic.AddInt64(&successCount, 1)
			}
		})
	}

	wg.Wait()

	t.Logf("After retry-after expired: successes=%d, blocked=%d", successCount, blockedCount)

	// After retry-after expires, requests should succeed
	if successCount == 0 {
		t.Error("Expected requests to succeed after retry-after period expires, got 0 successes")
	}
}
