package tasks

import (
	"bytes"
	"compress/gzip"
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

// mockESIClientForStreaming extends mockESIClient to support DoRequest for streaming
type mockESIClientForStreaming struct {
	doRequestFunc func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error)
	doFunc        func(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error)
}

func (m *mockESIClientForStreaming) Do(ctx context.Context, method, path string, headers map[string]string, body []byte, groupDesignation esiratelimiter.GroupDesignation) ([]byte, *http.Response, error) {
	if m.doFunc != nil {
		return m.doFunc(ctx, method, path, headers, body, groupDesignation)
	}
	return nil, nil, errors.New("doFunc not set")
}

func (m *mockESIClientForStreaming) DoRequest(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
	if m.doRequestFunc != nil {
		return m.doRequestFunc(ctx, method, path, headers, groupDesignation)
	}
	return nil, errors.New("doRequestFunc not set")
}

// Helper to create a test industry systems JSON response
func createIndustrySystemsJSON(systems []ESIIndustrySystem) []byte {
	data, _ := json.Marshal(systems)
	return data
}

// Helper to create a gzipped response body
func createGzippedBody(data []byte) ([]byte, error) {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write(data); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Helper to create a test system index
func createTestSystemIndex(systemID int32, activities map[string]float64) ESIIndustrySystem {
	costIndices := make([]ESICostIndice, 0, len(activities))
	for activity, costIndex := range activities {
		costIndices = append(costIndices, ESICostIndice{
			Activity:  activity,
			CostIndex: costIndex,
		})
	}
	return ESIIndustrySystem{
		SolarSystemID: systemID,
		CostIndices:   costIndices,
	}
}

func TestStreamIndustrySystems_NilESIClient(t *testing.T) {
	ctx := context.Background()
	var cacheSeconds int

	_, notModified, bytesRead, err := StreamIndustrySystems(ctx, nil, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_NilCallback(t *testing.T) {
	ctx := context.Background()
	esiClient := &mockESIClientForStreaming{}
	var cacheSeconds int

	_, notModified, bytesRead, err := StreamIndustrySystems(ctx, esiClient, "", nil, &cacheSeconds)

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

func TestStreamIndustrySystems_304NotModified(t *testing.T) {
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

	returnedETag, notModified, bytesRead, err := StreamIndustrySystems(ctx, esiClient, etag, func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_Non200Status(t *testing.T) {
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

	returnedETag, notModified, bytesRead, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_SuccessfulStreaming(t *testing.T) {
	ctx := context.Background()
	systems := []ESIIndustrySystem{
		createTestSystemIndex(30000142, map[string]float64{
			"manufacturing": 0.1,
			"copying":       0.05,
		}),
		createTestSystemIndex(30000144, map[string]float64{
			"invention":     0.15,
			"reaction":      0.2,
			"manufacturing": 0.12,
		}),
	}
	jsonData := createIndustrySystemsJSON(systems)
	var cacheSeconds int
	var processedItems []esitypes.SystemIndexes

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

	returnedETag, notModified, bytesRead, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
		processedItems = append(processedItems, s)
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
	if len(processedItems) != 2 {
		t.Errorf("expected 2 items to be processed, got %d", len(processedItems))
	}
	if bytesRead == 0 {
		t.Error("expected bytesRead to be greater than 0")
	}
	if cacheSeconds != 600 {
		t.Errorf("expected cacheSeconds to be 600, got %d", cacheSeconds)
	}

	// Verify first system
	if processedItems[0].SolarSystemID != 30000142 {
		t.Errorf("expected first system ID 30000142, got %d", processedItems[0].SolarSystemID)
	}
	if processedItems[0].Manufacturing != 0.1 {
		t.Errorf("expected manufacturing 0.1, got %f", processedItems[0].Manufacturing)
	}
	if processedItems[0].Copying != 0.05 {
		t.Errorf("expected copying 0.05, got %f", processedItems[0].Copying)
	}

	// Verify second system
	if processedItems[1].SolarSystemID != 30000144 {
		t.Errorf("expected second system ID 30000144, got %d", processedItems[1].SolarSystemID)
	}
	if processedItems[1].Invention != 0.15 {
		t.Errorf("expected invention 0.15, got %f", processedItems[1].Invention)
	}
	if processedItems[1].Reaction != 0.2 {
		t.Errorf("expected reaction 0.2, got %f", processedItems[1].Reaction)
	}
}

func TestStreamIndustrySystems_GzipCompression(t *testing.T) {
	ctx := context.Background()
	systems := []ESIIndustrySystem{
		createTestSystemIndex(30000142, map[string]float64{
			"manufacturing": 0.1,
		}),
	}
	jsonData := createIndustrySystemsJSON(systems)
	gzippedData, err := createGzippedBody(jsonData)
	if err != nil {
		t.Fatalf("failed to create gzipped data: %v", err)
	}

	var processedItems []esitypes.SystemIndexes

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

	_, notModified, bytesRead, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
		processedItems = append(processedItems, s)
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
	if processedItems[0].SolarSystemID != 30000142 {
		t.Errorf("expected system ID 30000142, got %d", processedItems[0].SolarSystemID)
	}
}

func TestStreamIndustrySystems_InvalidJSON(t *testing.T) {
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

	_, notModified, _, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_NotArray(t *testing.T) {
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

	_, notModified, _, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_CallbackError(t *testing.T) {
	ctx := context.Background()
	systems := []ESIIndustrySystem{
		createTestSystemIndex(30000142, map[string]float64{
			"manufacturing": 0.1,
		}),
	}
	jsonData := createIndustrySystemsJSON(systems)

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
	_, notModified, _, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_RetryOnError(t *testing.T) {
	ctx := context.Background()
	systems := []ESIIndustrySystem{
		createTestSystemIndex(30000142, map[string]float64{
			"manufacturing": 0.1,
		}),
	}
	jsonData := createIndustrySystemsJSON(systems)
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

	_, notModified, _, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestStreamIndustrySystems_RateLimitError(t *testing.T) {
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

	_, notModified, _, err := StreamIndustrySystems(ctx, esiClient, "", func(s esitypes.SystemIndexes) error {
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

func TestRefreshSystemIndexes_NilTask(t *testing.T) {
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
	err := RefreshSystemIndexes(ctx, nil, deps)
	if err == nil {
		t.Error("expected error when task is nil")
	}
}

func TestRefreshSystemIndexes_LockAcquisitionFailure(t *testing.T) {
	// This test would require mocking AcquireRefreshLock
	// Since it's in a different package, this is better tested in integration tests
	t.Skip("Requires mocking AcquireRefreshLock - better suited for integration tests")
}

func TestRefreshSystemIndexes_StatusCheckFailure(t *testing.T) {
	// This test would require mocking CheckServerStatus
	// Since it's in a different package, this is better tested in integration tests
	t.Skip("Requires mocking CheckServerStatus - better suited for integration tests")
}

func TestRefreshSystemIndexes_NotModified(t *testing.T) {
	// This test requires full integration with Redis, ESI client, and status checks
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshSystemIndexes_SuccessfulRefresh(t *testing.T) {
	// This test requires full integration with Redis, ESI client, and status checks
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshSystemIndexes_ETagSaveFailure(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshSystemIndexes_StreamError(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}
