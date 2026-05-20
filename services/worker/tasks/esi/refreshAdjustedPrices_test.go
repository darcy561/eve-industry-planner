package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/redis/go-redis/v9"
)

// Helper to create a test adjusted prices JSON response
func createAdjustedPricesJSON(prices []ESIAdjustedPrice) []byte {
	data, _ := json.Marshal(prices)
	return data
}

// Helper to create a test adjusted price
func createTestAdjustedPrice(typeID int32, adjustedPrice, averagePrice float64) ESIAdjustedPrice {
	return ESIAdjustedPrice{
		TypeID:        typeID,
		AdjustedPrice: adjustedPrice,
		AveragePrice:  averagePrice,
	}
}

func TestStreamAdjustedPrices_NilESIClient(t *testing.T) {
	ctx := context.Background()
	var cacheSeconds int

	_, notModified, bytesRead, err := StreamAdjustedPrices(ctx, nil, "", func(m esitypes.AdjustedPrice) error {
		return nil
	}, &cacheSeconds)

	if err == nil {
		t.Error("expected error when ESI client is nil")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	if bytesRead != 0 {
		t.Error("expected bytesRead to be 0 on error")
	}
	if !strings.Contains(err.Error(), "nil") {
		t.Errorf("expected error to mention nil, got: %v", err)
	}
}

func TestStreamAdjustedPrices_NilCallback(t *testing.T) {
	ctx := context.Background()
	esiClient := &mockESIClientForStreaming{}
	var cacheSeconds int

	_, notModified, bytesRead, err := StreamAdjustedPrices(ctx, esiClient, "", nil, &cacheSeconds)

	if err == nil {
		t.Error("expected error when callback is nil")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	if bytesRead != 0 {
		t.Error("expected bytesRead to be 0 on error")
	}
	if !strings.Contains(err.Error(), "nil") {
		t.Errorf("expected error to mention nil, got: %v", err)
	}
}

func TestStreamAdjustedPrices_304NotModified(t *testing.T) {
	ctx := context.Background()
	etag := "test-etag-123"
	newETag := "test-etag-456"
	var cacheSeconds int

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			// Verify If-None-Match header is set
			if headers["If-None-Match"] != etag {
				t.Errorf("expected If-None-Match header to be %s, got %s", etag, headers["If-None-Match"])
			}

			resp := &http.Response{
				StatusCode: http.StatusNotModified,
				Status:     "304 Not Modified",
				Header:     make(http.Header),
				Body:       http.NoBody,
			}
			resp.Header.Set("ETag", newETag)
			resp.Header.Set("Cache-Control", "max-age=300")
			return resp, nil
		},
	}

	returnedETag, notModified, bytesRead, err := StreamAdjustedPrices(ctx, esiClient, etag, func(m esitypes.AdjustedPrice) error {
		t.Error("callback should not be called for 304 response")
		return nil
	}, &cacheSeconds)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if !notModified {
		t.Error("expected notModified to be true for 304 response")
	}
	if returnedETag != newETag {
		t.Errorf("expected ETag %s, got %s", newETag, returnedETag)
	}
	if bytesRead != 0 {
		t.Errorf("expected bytesRead to be 0 for 304, got %d", bytesRead)
	}
	if cacheSeconds != 300 {
		t.Errorf("expected cacheSeconds to be 300, got %d", cacheSeconds)
	}
}

func TestStreamAdjustedPrices_Non200Status(t *testing.T) {
	ctx := context.Background()
	var cacheSeconds int

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusInternalServerError,
				Status:     "500 Internal Server Error",
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("Internal Server Error")),
			}
			resp.Header.Set("ETag", "error-etag")
			return resp, nil
		},
	}

	returnedETag, notModified, bytesRead, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		t.Error("callback should not be called for non-200 response")
		return nil
	}, &cacheSeconds)

	if err == nil {
		t.Error("expected error for non-200 status code")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	if returnedETag != "error-etag" {
		t.Errorf("expected ETag to be extracted even on error, got %s", returnedETag)
	}
	_ = bytesRead // bytesRead is 0 on error
}

func TestStreamAdjustedPrices_SuccessfulStreaming(t *testing.T) {
	ctx := context.Background()
	prices := []ESIAdjustedPrice{
		createTestAdjustedPrice(34, 100.5, 99.2),
		createTestAdjustedPrice(35, 200.75, 198.5),
		createTestAdjustedPrice(36, 50.25, 49.8),
	}
	jsonData := createAdjustedPricesJSON(prices)
	var cacheSeconds int
	var processedItems []esitypes.AdjustedPrice

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "success-etag")
			resp.Header.Set("Cache-Control", "max-age=600")
			return resp, nil
		},
	}

	returnedETag, notModified, bytesRead, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		processedItems = append(processedItems, m)
		return nil
	}, &cacheSeconds)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false for successful streaming")
	}
	if returnedETag != "success-etag" {
		t.Errorf("expected ETag %s, got %s", "success-etag", returnedETag)
	}
	if len(processedItems) != 3 {
		t.Errorf("expected 3 items to be processed, got %d", len(processedItems))
	}
	if bytesRead == 0 {
		t.Error("expected bytesRead to be greater than 0")
	}
	if cacheSeconds != 600 {
		t.Errorf("expected cacheSeconds to be 600, got %d", cacheSeconds)
	}

	// Verify first price
	if processedItems[0].TypeID != 34 {
		t.Errorf("expected first type ID 34, got %d", processedItems[0].TypeID)
	}
	if processedItems[0].AdjustedPrice != 100.5 {
		t.Errorf("expected adjusted price 100.5, got %f", processedItems[0].AdjustedPrice)
	}

	// Verify second price
	if processedItems[1].TypeID != 35 {
		t.Errorf("expected second type ID 35, got %d", processedItems[1].TypeID)
	}
	if processedItems[1].AdjustedPrice != 200.75 {
		t.Errorf("expected adjusted price 200.75, got %f", processedItems[1].AdjustedPrice)
	}

	// Verify third price
	if processedItems[2].TypeID != 36 {
		t.Errorf("expected third type ID 36, got %d", processedItems[2].TypeID)
	}
	if processedItems[2].AdjustedPrice != 50.25 {
		t.Errorf("expected adjusted price 50.25, got %f", processedItems[2].AdjustedPrice)
	}

	// Verify all have LastUpdated set
	for i, item := range processedItems {
		if item.LastUpdated == 0 {
			t.Errorf("expected LastUpdated to be set for item %d", i)
		}
	}
}

func TestStreamAdjustedPrices_GzipCompression(t *testing.T) {
	ctx := context.Background()
	prices := []ESIAdjustedPrice{
		createTestAdjustedPrice(34, 100.5, 99.2),
	}
	jsonData := createAdjustedPricesJSON(prices)
	gzippedData, err := createGzippedBody(jsonData)
	if err != nil {
		t.Fatalf("failed to create gzipped data: %v", err)
	}

	var processedItems []esitypes.AdjustedPrice

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(gzippedData)),
			}
			resp.Header.Set("ETag", "gzip-etag")
			resp.Header.Set("Content-Encoding", "gzip")
			return resp, nil
		},
	}

	_, notModified, bytesRead, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		processedItems = append(processedItems, m)
		return nil
	}, nil)

	_ = bytesRead // bytesRead is checked in other tests

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false")
	}
	if len(processedItems) != 1 {
		t.Errorf("expected 1 item to be processed, got %d", len(processedItems))
	}
	if processedItems[0].TypeID != 34 {
		t.Errorf("expected type ID 34, got %d", processedItems[0].TypeID)
	}
	if processedItems[0].AdjustedPrice != 100.5 {
		t.Errorf("expected adjusted price 100.5, got %f", processedItems[0].AdjustedPrice)
	}
}

func TestStreamAdjustedPrices_InvalidJSON(t *testing.T) {
	ctx := context.Background()
	var cacheSeconds int

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("invalid json")),
			}
			resp.Header.Set("ETag", "invalid-etag")
			return resp, nil
		},
	}

	_, notModified, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		t.Error("callback should not be called for invalid JSON")
		return nil
	}, &cacheSeconds)

	if err == nil {
		t.Error("expected error for invalid JSON")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
}

func TestStreamAdjustedPrices_NotArray(t *testing.T) {
	ctx := context.Background()
	var cacheSeconds int

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(`{"not": "an array"}`)),
			}
			resp.Header.Set("ETag", "not-array-etag")
			return resp, nil
		},
	}

	_, notModified, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		t.Error("callback should not be called for non-array JSON")
		return nil
	}, &cacheSeconds)

	if err == nil {
		t.Error("expected error for non-array JSON")
	}
	if !strings.Contains(err.Error(), "array") {
		t.Errorf("expected error to mention array, got: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
}

func TestStreamAdjustedPrices_CallbackError(t *testing.T) {
	ctx := context.Background()
	prices := []ESIAdjustedPrice{
		createTestAdjustedPrice(34, 100.5, 99.2),
	}
	jsonData := createAdjustedPricesJSON(prices)

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "callback-error-etag")
			return resp, nil
		},
	}

	callbackErr := errors.New("callback error")
	_, notModified, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		return callbackErr
	}, nil)

	if err == nil {
		t.Error("expected error when callback returns error")
	}
	if err != callbackErr {
		t.Errorf("expected callback error, got: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
}

func TestStreamAdjustedPrices_RetryOnError(t *testing.T) {
	ctx := context.Background()
	prices := []ESIAdjustedPrice{
		createTestAdjustedPrice(34, 100.5, 99.2),
	}
	jsonData := createAdjustedPricesJSON(prices)
	attemptCount := 0

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			attemptCount++
			if attemptCount < 3 {
				return nil, errors.New("temporary error")
			}
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "retry-success-etag")
			return resp, nil
		},
	}

	_, notModified, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		return nil
	}, nil)

	if err != nil {
		t.Errorf("unexpected error after retries: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false")
	}
	if attemptCount != 3 {
		t.Errorf("expected 3 attempts, got %d", attemptCount)
	}
}

func TestStreamAdjustedPrices_RateLimitError(t *testing.T) {
	ctx := context.Background()
	rateLimitErr := &esiratelimiter.RateLimitError{
		Retryable:  true,
		RetryAfter: time.Now().Add(30 * time.Second),
		Reason:     "insufficient tokens",
	}

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			return nil, rateLimitErr
		},
	}

	_, notModified, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		t.Error("callback should not be called on rate limit error")
		return nil
	}, nil)

	if err == nil {
		t.Error("expected error for rate limit")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	// Should stop retrying immediately on rate limit error
	if !esiratelimiter.IsRateLimitError(err) {
		t.Errorf("expected rate limit error, got: %v", err)
	}
}

func TestStreamAdjustedPrices_OnlyAdjustedPriceSaved(t *testing.T) {
	ctx := context.Background()
	// Create a price with both adjusted_price and average_price
	prices := []ESIAdjustedPrice{
		createTestAdjustedPrice(34, 100.5, 99.2), // average_price should be ignored
	}
	jsonData := createAdjustedPricesJSON(prices)
	var processedItems []esitypes.AdjustedPrice

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "adjusted-only-etag")
			return resp, nil
		},
	}

	_, _, _, err := StreamAdjustedPrices(ctx, esiClient, "", func(m esitypes.AdjustedPrice) error {
		processedItems = append(processedItems, m)
		return nil
	}, nil)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if len(processedItems) != 1 {
		t.Fatalf("expected 1 item, got %d", len(processedItems))
	}

	// Verify only adjusted_price is saved (average_price should not be in AdjustedPrice struct)
	if processedItems[0].AdjustedPrice != 100.5 {
		t.Errorf("expected adjusted price 100.5, got %f", processedItems[0].AdjustedPrice)
	}
	// AdjustedPrice struct doesn't have AveragePrice field, which is correct
}

func TestRefreshAdjustedPrices_NilTask(t *testing.T) {
	ctx := context.Background()
	redisClient := redis.NewClient(&redis.Options{
		Addr: "invalid:6379",
	})

	deps := &TaskDependencies{
		ServiceClients: &shared.ServiceClients{
			Redis: redisClient,
		},
		ESIClient: &mockESIClientForStreaming{},
	}

	// Should return error when task is nil
	err := RefreshAdjustedPrices(ctx, nil, deps)
	if err == nil {
		t.Error("expected error when task is nil")
	}
}

func TestRefreshAdjustedPrices_LockAcquisitionFailure(t *testing.T) {
	// This test would require mocking AcquireRefreshLock
	// Since it's in a different package, this is better tested in integration tests
	t.Skip("Requires mocking AcquireRefreshLock - better suited for integration tests")
}

func TestRefreshAdjustedPrices_StatusCheckFailure(t *testing.T) {
	// This test would require mocking CheckServerStatus
	// Since it's in a different package, this is better tested in integration tests
	t.Skip("Requires mocking CheckServerStatus - better suited for integration tests")
}

func TestRefreshAdjustedPrices_NotModified(t *testing.T) {
	// This test requires full integration with Redis, ESI client, and status checks
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshAdjustedPrices_SuccessfulRefresh(t *testing.T) {
	// This test requires full integration with Redis, ESI client, and status checks
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshAdjustedPrices_ETagSaveFailure(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshAdjustedPrices_StreamError(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}
