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

	natscore "eve-industry-planner/shared/core/nats"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// Helper to create a test market order
func createTestMarketOrder(orderID int64, typeID int32, locationID int64, price float64, isBuyOrder bool, _ int64) ESIMarketOrder {
	return ESIMarketOrder{
		OrderID:      orderID,
		TypeID:       typeID,
		LocationID:   locationID,
		Price:        price,
		IsBuyOrder:   isBuyOrder,
		Duration:     30,
		Issued:       time.Now(),
		MinVolume:    1,
		Range:        "station",
		SystemID:     30000142,
		VolumeRemain: 100,
		VolumeTotal:  100,
	}
}

// Helper to create market orders JSON
func createMarketOrdersJSON(orders []ESIMarketOrder) []byte {
	data, _ := json.Marshal(orders)
	return data
}

func TestFilterOrdersByStation(t *testing.T) {
	stationID := int64(60008494)
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, stationID, 100.0, true, stationID),
		createTestMarketOrder(2, 34, 60008495, 200.0, false, 60008495), // Different station
		createTestMarketOrder(3, 34, stationID, 150.0, false, stationID),
		createTestMarketOrder(4, 34, 60008496, 300.0, true, 60008496), // Different station
	}

	filtered := filterOrdersByStation(orders, stationID)

	if len(filtered) != 2 {
		t.Errorf("expected 2 filtered orders, got %d", len(filtered))
	}
	if filtered[0].OrderID != 1 {
		t.Errorf("expected first order ID 1, got %d", filtered[0].OrderID)
	}
	if filtered[1].OrderID != 3 {
		t.Errorf("expected second order ID 3, got %d", filtered[1].OrderID)
	}
}

func TestFilterOrdersByStation_EmptyResult(t *testing.T) {
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008495, 100.0, true, 60008495),
		createTestMarketOrder(2, 34, 60008496, 200.0, false, 60008496),
	}

	filtered := filterOrdersByStation(orders, 60008494)

	if len(filtered) != 0 {
		t.Errorf("expected 0 filtered orders, got %d", len(filtered))
	}
}

func TestCategorizeOrders(t *testing.T) {
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),  // Buy
		createTestMarketOrder(2, 34, 60008494, 200.0, false, 60008494), // Sell
		createTestMarketOrder(3, 34, 60008494, 150.0, true, 60008494),  // Buy
		createTestMarketOrder(4, 34, 60008494, 250.0, false, 60008494), // Sell
	}

	buyOrders, sellOrders := categorizeOrders(orders)

	if len(buyOrders) != 2 {
		t.Errorf("expected 2 buy orders, got %d", len(buyOrders))
	}
	if len(sellOrders) != 2 {
		t.Errorf("expected 2 sell orders, got %d", len(sellOrders))
	}

	// Verify buy orders
	for _, order := range buyOrders {
		if !order.IsBuyOrder {
			t.Errorf("expected buy order, got sell order with ID %d", order.OrderID)
		}
	}

	// Verify sell orders
	for _, order := range sellOrders {
		if order.IsBuyOrder {
			t.Errorf("expected sell order, got buy order with ID %d", order.OrderID)
		}
	}
}

func TestCategorizeOrders_OnlyBuy(t *testing.T) {
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
		createTestMarketOrder(2, 34, 60008494, 200.0, true, 60008494),
	}

	buyOrders, sellOrders := categorizeOrders(orders)

	if len(buyOrders) != 2 {
		t.Errorf("expected 2 buy orders, got %d", len(buyOrders))
	}
	if len(sellOrders) != 0 {
		t.Errorf("expected 0 sell orders, got %d", len(sellOrders))
	}
}

func TestCategorizeOrders_OnlySell(t *testing.T) {
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, false, 60008494),
		createTestMarketOrder(2, 34, 60008494, 200.0, false, 60008494),
	}

	buyOrders, sellOrders := categorizeOrders(orders)

	if len(buyOrders) != 0 {
		t.Errorf("expected 0 buy orders, got %d", len(buyOrders))
	}
	if len(sellOrders) != 2 {
		t.Errorf("expected 2 sell orders, got %d", len(sellOrders))
	}
}

func TestGetBestBuyAndSellPrices(t *testing.T) {
	buyOrders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
		createTestMarketOrder(2, 34, 60008494, 150.0, true, 60008494),
		createTestMarketOrder(3, 34, 60008494, 120.0, true, 60008494),
	}

	sellOrders := []ESIMarketOrder{
		createTestMarketOrder(4, 34, 60008494, 200.0, false, 60008494),
		createTestMarketOrder(5, 34, 60008494, 180.0, false, 60008494),
		createTestMarketOrder(6, 34, 60008494, 220.0, false, 60008494),
	}

	highestBuy, lowestSell := getBestBuyAndSellPrices(buyOrders, sellOrders)

	if highestBuy != 150.0 {
		t.Errorf("expected highest buy price 150.0, got %f", highestBuy)
	}
	if lowestSell != 180.0 {
		t.Errorf("expected lowest sell price 180.0, got %f", lowestSell)
	}
}

func TestGetBestBuyAndSellPrices_NoBuyOrders(t *testing.T) {
	buyOrders := []ESIMarketOrder{}
	sellOrders := []ESIMarketOrder{
		createTestMarketOrder(4, 34, 60008494, 200.0, false, 60008494),
	}

	highestBuy, lowestSell := getBestBuyAndSellPrices(buyOrders, sellOrders)

	if highestBuy != 0 {
		t.Errorf("expected highest buy price 0, got %f", highestBuy)
	}
	if lowestSell != 200.0 {
		t.Errorf("expected lowest sell price 200.0, got %f", lowestSell)
	}
}

func TestGetBestBuyAndSellPrices_NoSellOrders(t *testing.T) {
	buyOrders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
	}
	sellOrders := []ESIMarketOrder{}

	highestBuy, lowestSell := getBestBuyAndSellPrices(buyOrders, sellOrders)

	if highestBuy != 100.0 {
		t.Errorf("expected highest buy price 100.0, got %f", highestBuy)
	}
	if lowestSell != 0 {
		t.Errorf("expected lowest sell price 0, got %f", lowestSell)
	}
}

func TestGetBestBuyAndSellPrices_NoOrders(t *testing.T) {
	buyOrders := []ESIMarketOrder{}
	sellOrders := []ESIMarketOrder{}

	highestBuy, lowestSell := getBestBuyAndSellPrices(buyOrders, sellOrders)

	if highestBuy != 0 {
		t.Errorf("expected highest buy price 0, got %f", highestBuy)
	}
	if lowestSell != 0 {
		t.Errorf("expected lowest sell price 0, got %f", lowestSell)
	}
}

func TestFetchPaginatedMarketOrders_NilESIClient(t *testing.T) {
	ctx := context.Background()

	_, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, nil, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		return nil
	}, nil)

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

func TestFetchPaginatedMarketOrders_NilCallback(t *testing.T) {
	ctx := context.Background()
	esiClient := &mockESIClientForStreaming{}

	_, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, nil, nil)

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

func TestFetchPaginatedMarketOrders_FirstPage304(t *testing.T) {
	ctx := context.Background()
	prevETags := map[int]string{
		1: "page1-etag",
	}
	var cacheSeconds int

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			// Verify If-None-Match header is set
			if headers["If-None-Match"] != "page1-etag" {
				t.Errorf("expected If-None-Match header to be page1-etag, got %s", headers["If-None-Match"])
			}

			resp := &http.Response{
				StatusCode: http.StatusNotModified,
				Status:     "304 Not Modified",
				Header:     make(http.Header),
				Body:       http.NoBody,
			}
			resp.Header.Set("ETag", "new-page1-etag")
			resp.Header.Set("Cache-Control", "max-age=300")
			return resp, nil
		},
	}

	etags, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, prevETags, func(order ESIMarketOrder) error {
		t.Error("callback should not be called for 304 response")
		return nil
	}, &cacheSeconds)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if !notModified {
		t.Error("expected notModified to be true for 304 response")
	}
	if bytesRead != 0 {
		t.Errorf("expected bytesRead to be 0 for 304, got %d", bytesRead)
	}
	if cacheSeconds != 300 {
		t.Errorf("expected cacheSeconds to be 300, got %d", cacheSeconds)
	}
	if len(etags) != 1 {
		t.Errorf("expected 1 ETag, got %d", len(etags))
	}
}

func TestFetchPaginatedMarketOrders_SinglePage(t *testing.T) {
	ctx := context.Background()
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
		createTestMarketOrder(2, 34, 60008494, 200.0, false, 60008494),
	}
	jsonData := createMarketOrdersJSON(orders)
	var processedOrders []ESIMarketOrder

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "page1-etag")
			resp.Header.Set("X-Pages", "1") // Only one page
			resp.Header.Set("Cache-Control", "max-age=600")
			return resp, nil
		},
	}

	etags, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		processedOrders = append(processedOrders, order)
		return nil
	}, nil)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false")
	}
	if len(processedOrders) != 2 {
		t.Errorf("expected 2 orders, got %d", len(processedOrders))
	}
	if bytesRead == 0 {
		t.Error("expected bytesRead to be greater than 0")
	}
	if len(etags) != 1 {
		t.Errorf("expected 1 ETag, got %d", len(etags))
	}
	if etags[1] != "page1-etag" {
		t.Errorf("expected page1 ETag, got %s", etags[1])
	}
}

func TestFetchPaginatedMarketOrders_MultiplePages(t *testing.T) {
	ctx := context.Background()
	page1Orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
	}
	page2Orders := []ESIMarketOrder{
		createTestMarketOrder(2, 34, 60008494, 200.0, false, 60008494),
	}
	page1Data := createMarketOrdersJSON(page1Orders)
	page2Data := createMarketOrdersJSON(page2Orders)

	pageCount := 0
	var processedOrders []ESIMarketOrder

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			pageCount++
			var bodyData []byte
			var etag string
			var xPages string

			switch pageCount {
			case 1:
				bodyData = page1Data
				etag = "page1-etag"
				xPages = "2"
			case 2:
				bodyData = page2Data
				etag = "page2-etag"
				xPages = "2"
			}

			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(bodyData)),
			}
			resp.Header.Set("ETag", etag)
			resp.Header.Set("X-Pages", xPages)
			return resp, nil
		},
	}

	etags, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		processedOrders = append(processedOrders, order)
		return nil
	}, nil)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if notModified {
		t.Error("expected notModified to be false")
	}
	if pageCount != 2 {
		t.Errorf("expected 2 page requests, got %d", pageCount)
	}
	if len(processedOrders) != 2 {
		t.Errorf("expected 2 orders, got %d", len(processedOrders))
	}
	if bytesRead == 0 {
		t.Error("expected bytesRead to be greater than 0")
	}
	if len(etags) != 2 {
		t.Errorf("expected 2 ETags, got %d", len(etags))
	}
	if etags[1] != "page1-etag" {
		t.Errorf("expected page1 ETag, got %s", etags[1])
	}
	if etags[2] != "page2-etag" {
		t.Errorf("expected page2 ETag, got %s", etags[2])
	}
}

func TestFetchPaginatedMarketOrders_Non200Status(t *testing.T) {
	ctx := context.Background()

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

	etags, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		t.Error("callback should not be called for non-200 response")
		return nil
	}, nil)

	if err == nil {
		t.Error("expected error for non-200 status code")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	if len(etags) == 0 {
		t.Error("expected ETag to be extracted even on error")
	}
	_ = bytesRead // bytesRead is 0 on error
}

func TestFetchPaginatedMarketOrders_InvalidJSON(t *testing.T) {
	ctx := context.Background()

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("invalid json")),
			}
			resp.Header.Set("ETag", "invalid-etag")
			resp.Header.Set("X-Pages", "1")
			return resp, nil
		},
	}

	_, notModified, _, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		t.Error("callback should not be called for invalid JSON")
		return nil
	}, nil)

	if err == nil {
		t.Error("expected error for invalid JSON")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
}

func TestFetchPaginatedMarketOrders_CallbackError(t *testing.T) {
	ctx := context.Background()
	orders := []ESIMarketOrder{
		createTestMarketOrder(1, 34, 60008494, 100.0, true, 60008494),
	}
	jsonData := createMarketOrdersJSON(orders)

	esiClient := &mockESIClientForStreaming{
		doRequestFunc: func(ctx context.Context, method, path string, headers map[string]string, groupDesignation esiratelimiter.GroupDesignation) (*http.Response, error) {
			resp := &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Header:     make(http.Header),
				Body:       io.NopCloser(bytes.NewReader(jsonData)),
			}
			resp.Header.Set("ETag", "callback-error-etag")
			resp.Header.Set("X-Pages", "1")
			return resp, nil
		},
	}

	callbackErr := errors.New("callback error")
	_, notModified, _, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
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

func TestFetchPaginatedMarketOrders_RateLimitError(t *testing.T) {
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

	_, notModified, _, err := FetchPaginatedMarketOrders(ctx, esiClient, nil, 10000002, 34, 10000002, nil, func(order ESIMarketOrder) error {
		t.Error("callback should not be called on rate limit error")
		return nil
	}, nil)

	if err == nil {
		t.Error("expected error for rate limit")
	}
	if notModified {
		t.Error("expected notModified to be false on error")
	}
	if !esiratelimiter.IsRateLimitError(err) {
		t.Errorf("expected rate limit error, got: %v", err)
	}
}

func TestRefreshMarketPrices_NilTask(t *testing.T) {
	ctx := context.Background()
	redisClient := redis.NewClient(&redis.Options{
		Addr: "invalid:6379",
	})

	deps := &TaskDependencies{
		Redis: redisClient,
		ESIClient: &mockESIClientForStreaming{},
	}

	// Should return error when task is nil
	err := RefreshMarketPrices(ctx, nil, deps)
	if err == nil {
		t.Error("expected error when task is nil")
	}
}

func TestRefreshMarketPrices_InvalidJSON(t *testing.T) {
	ctx := context.Background()
	// Create a task with invalid JSON payload
	invalidPayload := struct {
		TaskType string          `json:"task_type"`
		Data     json.RawMessage `json:"data"`
	}{
		TaskType: "refreshMarketPrices",
		Data:     []byte("invalid json"),
	}
	payloadBytes, _ := json.Marshal(invalidPayload)
	task := asynq.NewTask("refreshMarketPrices", payloadBytes)

	redisClient := redis.NewClient(&redis.Options{
		Addr: "invalid:6379",
	})

	deps := &TaskDependencies{
		Redis: redisClient,
		ESIClient: &mockESIClientForStreaming{},
	}

	err := RefreshMarketPrices(ctx, task, deps)
	if err == nil {
		t.Error("expected error when JSON is invalid")
	}
}

func TestRefreshMarketPrices_MissingParameters(t *testing.T) {
	ctx := context.Background()
	request := natscore.MarketPricesRequest{
		TypeID:     0, // Missing
		LocationID: 10000002,
		StationID:  60008494,
	}
	task := createMockTask("refreshMarketPrices", request)

	redisClient := redis.NewClient(&redis.Options{
		Addr: "invalid:6379",
	})

	deps := &TaskDependencies{
		Redis: redisClient,
		ESIClient: &mockESIClientForStreaming{},
	}

	err := RefreshMarketPrices(ctx, task, deps)
	if err == nil {
		t.Error("expected error when parameters are missing")
	}
	if !errors.Is(err, errors.New("missing required parameters")) && err.Error() != "missing required parameters" {
		t.Errorf("expected 'missing required parameters' error, got: %v", err)
	}
}

func TestRefreshMarketPrices_LockAcquisitionFailure(t *testing.T) {
	// This test would require mocking AcquireRefreshLock
	t.Skip("Requires mocking AcquireRefreshLock - better suited for integration tests")
}

func TestRefreshMarketPrices_StatusCheckFailure(t *testing.T) {
	// This test would require mocking CheckServerStatus
	t.Skip("Requires mocking CheckServerStatus - better suited for integration tests")
}

func TestRefreshMarketPrices_SuccessfulRefresh(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshMarketPrices_NotModified(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshMarketPrices_ETagSaveFailure(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}

func TestRefreshMarketPrices_StreamError(t *testing.T) {
	// This test requires full integration setup
	t.Skip("Requires full integration setup - better suited for integration tests")
}
