package esi

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	tasks "eve-industry-planner/shared/tasks"
)

// ESIMarketOrder represents an individual market order from ESI.
type ESIMarketOrder struct {
	Duration     int32     `json:"duration"`
	IsBuyOrder   bool      `json:"is_buy_order"`
	Issued       time.Time `json:"issued"`
	LocationID   int64     `json:"location_id"`
	MinVolume    int32     `json:"min_volume"`
	OrderID      int64     `json:"order_id"`
	Price        float64   `json:"price"`
	Range        string    `json:"range"`
	SystemID     int32     `json:"system_id"`
	TypeID       int32     `json:"type_id"`
	VolumeRemain int32     `json:"volume_remain"`
	VolumeTotal  int32     `json:"volume_total"`
}

// MarketPriceEntry is the normalized structure stored in Redis (matches legacy DBMarketPriceEntry pattern).
// Note: type_id and location_id are part of the Redis key, not stored in the value.
type MarketPriceEntry struct {
	Buy         float64 `json:"buy"`  // Highest buy order price
	Sell        float64 `json:"sell"` // Lowest sell order price
	LastUpdated int64   `json:"last_updated"`
}

// RefreshMarketPrices fetches market orders from ESI for a specific type and location using paginated requests.
// It checks for HTTP 304 Not Modified responses to avoid unnecessary work when data hasn't changed.
// When data has changed, all orders are persisted to Redis with location_id and type_id in the key.
// Cache headers and rate limiting are respected as in other refresh functions.
func RefreshMarketPrices(natsMessage MessageInterface, deps *TaskDependencies) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// This task requires a NATS message with data payload (type_id and location_id)
	// In normal operation via subscriber, natsMessage should never be nil
	if natsMessage == nil {
		logs.Error("market prices refresh requires a NATS message with data payload, exiting (nothing to acknowledge)")
		return
	}

	deliveryCount := natsMessage.NumDelivered()
	logs.Debug("Market Prices Refresh Message Received", "delivery_count", deliveryCount)

	// Parse JSON data from message payload into MarketPricesRequest
	var request natscore.MarketPricesRequest
	if err := natsMessage.ParseData(&request); err != nil {
		logs.Warn("failed to parse message data, dropping message", "error", err, "delivery_count", deliveryCount)
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack invalid message", "error", ackErr)
		}
		return
	}

	// If no request data provided, we can't proceed - acknowledge and drop to avoid retrying invalid data
	if request.TypeID == 0 || request.LocationID == 0 || request.StationID == 0 {
		logs.Warn("missing required parameters (type_id, location_id, or station_id), dropping message",
			"type_id", request.TypeID,
			"location_id", request.LocationID,
			"station_id", request.StationID,
			"delivery_count", deliveryCount)
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message with missing parameters", "error", ackErr)
		} else {
			logs.Debug("message acknowledged and dropped (missing required parameters)", "delivery_count", deliveryCount)
		}
		return
	}

	lockKey := fmt.Sprintf("esi:market_orders:%d:%d:refresh_lock", request.TypeID, request.LocationID)
	cleanup, shouldContinue := tasks.AcquireRefreshLock(ctx, deps.Redis, lockKey, natsMessage, deliveryCount)
	if !shouldContinue {
		return
	}
	defer cleanup()

	// Check server status before proceeding
	statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
	if !HandleStatusCheckResult(statusResult, natsMessage, "market prices refresh", deliveryCount) {
		return
	}

	var count int
	lastProgress := time.Now()
	start := time.Now()

	// Read previous ETags per page
	prevETags, err := rediscore.GetMarketOrdersETags(ctx, deps.Redis, request.TypeID, request.LocationID)
	if err != nil {
		logs.Debug("no previous ETags found", "location_id", request.LocationID, "type_id", request.TypeID)
		prevETags = make(map[int]string)
	}
	logs.Debug("market prices refresh started", "location_id", request.LocationID, "station_id", request.StationID, "type_id", request.TypeID, "etag_pages", len(prevETags))

	// Initial heartbeat so long fetches don't time out
	if natsMessage != nil {
		_ = natsMessage.InProgress()
	}

	var totalBytes int64
	var cacheSeconds int
	var allOrders []ESIMarketOrder

	newETags, notModified, bytesRead, err := FetchPaginatedMarketOrders(ctx, natsMessage, deps.ESIClient, request.LocationID, request.TypeID, prevETags, func(order ESIMarketOrder) error {
		allOrders = append(allOrders, order)
		count++
		// Send progress heartbeat at most every 5s
		if natsMessage != nil {
			if time.Since(lastProgress) >= 5*time.Second {
				_ = natsMessage.InProgress()
				lastProgress = time.Now()
			}
		}
		return nil
	}, &cacheSeconds)
	totalBytes = bytesRead

	if err != nil {
		HandleStreamError(err, natsMessage, "market prices refresh", deliveryCount, metrics.GetESIMarketPrices().Errors)
		return
	}

	if notModified {
		logs.Debug("Market Prices Refresh Completed - Not Modified (ETag Match)",
			"location_id", request.LocationID,
			"type_id", request.TypeID,
			"etag_pages", len(newETags))
		if natsMessage != nil {
			if ackErr := natsMessage.Ack(); ackErr != nil {
				logs.Warn("failed to ack message (not modified)", "error", ackErr)
			}
		}
		m := metrics.GetESIMarketPrices()
		m.Requests.Observe(time.Since(start).Seconds())
		m.Bytes.Add(float64(totalBytes))
		// Update metrics if cache headers available (for monitoring)
		if cacheSeconds > 0 {
			nextRefreshMillis := time.Now().Add(time.Duration(cacheSeconds) * time.Second).UnixMilli()
			metrics.GetESIMarketPrices().NextRefresh.Set(float64(nextRefreshMillis))
		}
		return
	}

	// Filter orders by station ID (like legacy version)
	stationOrders := filterOrdersByStation(allOrders, request.StationID)

	// Process orders to extract buy/sell prices (like legacy version)
	buyOrders, sellOrders := categorizeOrders(stationOrders)
	highestBuyPrice, lowestSellPrice := getBestBuyAndSellPrices(buyOrders, sellOrders)

	// Save processed market price entry (type_id and location_id are in the Redis key, not the value)
	priceEntry := MarketPriceEntry{
		Buy:         highestBuyPrice,
		Sell:        lowestSellPrice,
		LastUpdated: time.Now().UnixMilli(),
	}
	if err := rediscore.SaveMarketPriceEntry(ctx, deps.Redis, request.TypeID, request.LocationID, priceEntry); err != nil {
		logs.Error("failed to save market price entry, nacking with backoff", "error", err, "reason", "save_error", "delivery_count", deliveryCount)
		if natsMessage != nil {
			natscore.NackWithBackoff(natsMessage)
		}
		metrics.GetESIMarketPrices().Errors.WithLabelValues("save_error").Inc()
		return
	}

	// Save ETags per page
	if err := rediscore.SaveMarketOrdersETags(ctx, deps.Redis, request.TypeID, request.LocationID, newETags); err != nil {
		logs.Error("failed to save ETags, nacking with backoff", "error", err, "reason", "etag_save_error", "delivery_count", deliveryCount)
		if natsMessage != nil {
			natscore.NackWithBackoff(natsMessage)
		}
		metrics.GetESIMarketPrices().Errors.WithLabelValues("etag_save").Inc()
		return
	}

	// Save last updated timestamp
	nowMillis := time.Now().UnixMilli()
	if err := rediscore.SaveMarketOrdersLastUpdated(ctx, deps.Redis, request.TypeID, request.LocationID, nowMillis); err != nil {
		logs.Warn("failed to save last updated timestamp, nacking with backoff", "error", err, "reason", "last_updated_save_error", "delivery_count", deliveryCount)
		if natsMessage != nil {
			natscore.NackWithBackoff(natsMessage)
		}
		metrics.GetESIMarketPrices().Errors.WithLabelValues("last_updated_save").Inc()
		return
	}

	// Update refresh time tracking sorted set for finding oldest entries
	if err := rediscore.SaveMarketOrdersRefreshTime(ctx, deps.Redis, request.TypeID, request.LocationID, nowMillis); err != nil {
		logs.Warn("failed to save refresh time to sorted set", "error", err, "type_id", request.TypeID, "location_id", request.LocationID)
		// Don't fail the whole operation if this tracking fails
	}

	// Update metrics if cache headers available (for monitoring)
	if cacheSeconds > 0 {
		nextRefreshMillis := time.Now().Add(time.Duration(cacheSeconds) * time.Second).UnixMilli()
		metrics.GetESIMarketPrices().NextRefresh.Set(float64(nextRefreshMillis))
	}

	// Acknowledge message completion
	if natsMessage != nil {
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message", "error", ackErr)
		}
	}

	duration := time.Since(start)
	m := metrics.GetESIMarketPrices()
	m.Requests.Observe(duration.Seconds())
	m.Bytes.Add(float64(totalBytes))
	m.Items.Add(float64(count))
	m.LastUpdated.Set(float64(time.Now().UnixMilli()))
	logs.Debug("market prices updated",
		"type_id", request.TypeID,
		"location_id", request.LocationID,
		"station_id", request.StationID,
		"orders_total", count,
		"orders_filtered", len(stationOrders),
		"buy_price", highestBuyPrice,
		"sell_price", lowestSellPrice,
		"pages", len(newETags),
		"duration_ms", duration.Milliseconds())

	logs.Info("Market Prices Refresh Complete",
		"location_id", request.LocationID,
		"type_id", request.TypeID,
		"duration_ms", duration.Milliseconds())
}

// filterOrdersByStation filters orders to only include those matching the station ID.
func filterOrdersByStation(orders []ESIMarketOrder, stationID int64) []ESIMarketOrder {
	filtered := make([]ESIMarketOrder, 0, len(orders))
	for _, order := range orders {
		if order.LocationID == stationID {
			filtered = append(filtered, order)
		}
	}
	return filtered
}

// categorizeOrders separates orders into buy and sell orders.
func categorizeOrders(orders []ESIMarketOrder) (buyOrders, sellOrders []ESIMarketOrder) {
	buyOrders = make([]ESIMarketOrder, 0, len(orders)/2)
	sellOrders = make([]ESIMarketOrder, 0, len(orders)/2)

	for _, order := range orders {
		if order.IsBuyOrder {
			buyOrders = append(buyOrders, order)
		} else {
			sellOrders = append(sellOrders, order)
		}
	}
	return
}

// getBestBuyAndSellPrices finds the highest buy price and lowest sell price.
func getBestBuyAndSellPrices(buyOrders, sellOrders []ESIMarketOrder) (highestBuyPrice, lowestSellPrice float64) {
	highestBuyPrice = 0
	lowestSellPrice = math.MaxFloat64

	for _, order := range buyOrders {
		if order.Price > highestBuyPrice {
			highestBuyPrice = order.Price
		}
	}

	for _, order := range sellOrders {
		if order.Price < lowestSellPrice {
			lowestSellPrice = order.Price
		}
	}

	if lowestSellPrice == math.MaxFloat64 {
		lowestSellPrice = 0
	}

	return
}

// FetchPaginatedMarketOrders makes paginated HTTP requests to ESI market orders endpoint.
// It handles pagination automatically, checking for HTTP 304 Not Modified responses per page.
// For HTTP 200 OK responses, it performs a streaming decode and invokes onOrder for each order.
// Returns ETags per page (map[page]etag), whether any page was not modified, total bytes read, and any error.
// cacheSecondsOut will be populated with parsed cache max-age from response headers if available.
func FetchPaginatedMarketOrders(ctx context.Context, natsMessage MessageInterface, esiClient esiratelimiter.ClientInterface, regionID int32, typeID int32, prevETags map[int]string, onOrder func(ESIMarketOrder) error, cacheSecondsOut *int) (map[int]string, bool, int64, error) {
	if esiClient == nil {
		return nil, false, 0, errors.New("ESI client is nil")
	}
	if onOrder == nil {
		return nil, false, 0, errors.New("onOrder callback is nil")
	}

	if prevETags == nil {
		prevETags = make(map[int]string)
	}

	path := fmt.Sprintf("/v1/markets/%d/orders/", regionID)
	var totalBytes int64
	newETags := make(map[int]string)
	var anyNotModified bool

	page := 1
	maxAttempts := 4
	totalPages := 0 // Will be set from X-Pages header on first page

	for {
		// Build query parameters for this page
		queryPath := path + "?datasource=tranquility&order_type=all&type_id=" + strconv.FormatInt(int64(typeID), 10) + "&page=" + strconv.Itoa(page)

		headers := map[string]string{
			"Accept":          "application/json",
			"Accept-Encoding": "gzip",
		}
		// Send If-None-Match if we have an ETag for this page
		if prevETag, hasETag := prevETags[page]; hasETag && prevETag != "" {
			headers["If-None-Match"] = prevETag
		}

		logs.Debug("fetching market orders page", "page", page, "region_id", regionID, "type_id", typeID)

		// Retry on transient errors with exponential backoff + jitter
		var resp *http.Response
		var err error

		for attempt := 1; attempt <= maxAttempts; attempt++ {
			logs.Debug("making ESI request attempt", "attempt", attempt, "max_attempts", maxAttempts, "path", queryPath)
			groupDesignation := esiratelimiter.GroupDesignation{
				PrimaryGroup: "markets", // Market data endpoints
			}
			resp, err = esiClient.DoRequest(ctx, http.MethodGet, queryPath, headers, groupDesignation)
			if err == nil {
				logs.Debug("ESI request succeeded", "attempt", attempt, "path", queryPath)
				break
			}

			logs.Debug("ESI request failed",
				"attempt", attempt,
				"max_attempts", maxAttempts,
				"error", err,
				"error_type", fmt.Sprintf("%T", err),
				"path", queryPath)

			// Check if this is a rate limit error - return early to avoid unnecessary retries
			if ShouldStopRetryOnRateLimit(err, attempt, queryPath) {
				return nil, false, 0, err
			}

			if attempt >= maxAttempts {
				logs.Debug("max attempts reached, returning error", "attempt", attempt, "max_attempts", maxAttempts, "error", err)
				return nil, false, 0, err
			}

			// Exponential backoff: 500ms, 1s, 2s
			backoff := time.Duration(500*(1<<uint(attempt-1))) * time.Millisecond
			// Jitter: random 0-100ms
			jitter := time.Duration(rand.Intn(100)) * time.Millisecond
			waitTime := backoff + jitter
			logs.Debug("waiting before retry with exponential backoff", "attempt", attempt, "backoff", backoff, "jitter", jitter, "wait_time", waitTime)
			time.Sleep(waitTime)
		}

		if resp != nil {
			defer resp.Body.Close()
		}
		if resp == nil {
			return nil, false, 0, errors.New("nil HTTP response")
		}

		// Extract ETag for this page
		pageETag := resp.Header.Get("ETag")
		if pageETag != "" {
			newETags[page] = pageETag
		} else {
			// Keep previous ETag if no new one provided
			if prevETag, hasETag := prevETags[page]; hasETag {
				newETags[page] = prevETag
			}
		}

		// Parse cache seconds from first page
		if page == 1 && cacheSecondsOut != nil {
			*cacheSecondsOut = parseCacheSeconds(resp)
		}

		// Parse total pages from X-Pages header (available on all responses, including 304)
		if totalPages == 0 {
			xPagesStr := resp.Header.Get("X-Pages")
			if xPagesStr != "" {
				if parsed, err := strconv.Atoi(xPagesStr); err == nil && parsed > 0 {
					totalPages = parsed
					logs.Debug("parsed X-Pages header", "total_pages", totalPages, "page", page, "status", resp.StatusCode)
				} else {
					logs.Warn("failed to parse X-Pages header", "value", xPagesStr, "error", err)
				}
			}
		}

		// Check response status code
		if resp.StatusCode == http.StatusNotModified {
			anyNotModified = true
			logs.Debug("page not modified (304)", "page", page)
			// If first page is 304, we can stop early
			if page == 1 {
				return newETags, true, totalBytes, nil
			}
			// For subsequent pages, 304 means no more data - stop pagination
			break
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return newETags, false, totalBytes, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
		}

		// Handle gzip decompression if needed
		bodyReader := resp.Body
		if resp.Header.Get("Content-Encoding") == "gzip" {
			gzReader, err := gzip.NewReader(resp.Body)
			if err != nil {
				return newETags, false, totalBytes, err
			}
			bodyReader = gzReader
			defer gzReader.Close()
		}

		// Count bytes as we decode
		cr := &countingReader{r: bodyReader}
		dec := json.NewDecoder(cr)

		// Expect start of array
		tok, err := dec.Token()
		if err != nil {
			return newETags, false, totalBytes, err
		}
		del, ok := tok.(json.Delim)
		if !ok || del != '[' {
			return newETags, false, totalBytes, errors.New("invalid JSON: expected array start")
		}

		pageCount := 0
		for dec.More() {
			var order ESIMarketOrder
			if err := dec.Decode(&order); err != nil {
				return newETags, false, totalBytes, err
			}
			if err := onOrder(order); err != nil {
				return newETags, false, totalBytes, err
			}
			pageCount++
		}

		// Consume end of array
		if _, err := dec.Token(); err != nil {
			return newETags, false, totalBytes, err
		}

		totalBytes += cr.n
		logs.Debug("processed market orders page", "page", page, "orders", pageCount, "bytes", cr.n, "total_pages", totalPages)

		// Check if there are more pages using X-Pages header
		if totalPages > 0 {
			// We have X-Pages header - check if we've reached the last page
			if page >= totalPages {
				logs.Debug("reached last page from X-Pages header", "page", page, "total_pages", totalPages)
				break
			}
			page++
		} else {
			// No X-Pages header available - only query the first page
			logs.Debug("X-Pages header not available, stopping after first page", "page", page)
			break
		}
	}

	return newETags, anyNotModified, totalBytes, nil
}
