package tasks

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"time"

	esitypes "eve-industry-planner/shared/core/esi/types"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"
	esicore "eve-industry-planner/worker/esi"
	esiratelimiter "eve-industry-planner/worker/ratelimiter"

	"github.com/hibiken/asynq"
)

// ESIAdjustedPrice represents an individual adjusted price entry from ESI.
type ESIAdjustedPrice struct {
	TypeID        int32   `json:"type_id"`
	AdjustedPrice float64 `json:"adjusted_price"`
	AveragePrice  float64 `json:"average_price"`
}

// RefreshAdjustedPrices fetches the latest adjusted prices from ESI using a streaming decoder.
// It checks for HTTP 304 Not Modified responses to avoid unnecessary work when data hasn't changed.
// When data has changed, each item is persisted to Redis in the stream callback, and the ETag
// is saved after a successful pass. Cache headers are respected for scheduling future refreshes.
// Returns an error if processing fails - asynq will automatically retry on error.
func RefreshAdjustedPrices(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	logs.InfoCtx(ctx,"Adjusted Prices Refresh Task Received")

	// Acquire a lock to prevent concurrent refreshes
	lockKey := "esi:market_prices:refresh_lock"
	cleanup, shouldContinue := taskscore.AcquireRefreshLock(ctx, deps.Redis, lockKey)
	if !shouldContinue {
		// Lock already held - skip processing (not an error)
		return nil
	}
	defer cleanup()

	// Check server status before proceeding
	statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
	if err := HandleStatusCheckResult(ctx, statusResult, "adjusted prices refresh"); err != nil {
		return err
	}

	// Read previous ETag from Redis (if available) to leverage 304s.
	prevETag, err := rediscore.GetMarketPricesETag(ctx, deps.Redis)
	if err != nil {
		logs.DebugCtx(ctx,"failed to get previous ETag", "error", err)
	}

	start := time.Now()
	logs.DebugCtx(ctx,"Adjusted Prices Refresh Started", "etag_used", prevETag)

	var cacheSeconds int
	newETag, notModified, _, err := StreamAdjustedPrices(ctx, deps.ESIClient, prevETag, func(m esitypes.AdjustedPrice) error {
		if err := rediscore.SaveMarketPrice(ctx, deps.Redis, m.TypeID, m); err != nil {
			return err
		}
		return nil
	}, &cacheSeconds)
	if err != nil {
		return HandleStreamError(ctx, err, "adjusted prices refresh")
	}

	if notModified {
		logs.InfoCtx(ctx,"ESI adjusted prices not modified (ETag match)")
		return nil
	}

	if err := rediscore.SaveMarketPricesETag(ctx, deps.Redis, newETag); err != nil {
		logs.ErrorCtx(ctx,"failed to save ETag", "error", err, "reason", "etag_save_error")
		return fmt.Errorf("failed to save ETag: %w", err)
	}

	// Save last updated timestamp
	if err := rediscore.SaveMarketPricesLastUpdated(ctx, deps.Redis, time.Now().UnixMilli()); err != nil {
		logs.WarnCtx(ctx,"failed to save last updated timestamp", "error", err, "reason", "last_updated_save_error")
		return fmt.Errorf("failed to save last updated timestamp: %w", err)
	}

	duration := time.Since(start)
	logs.InfoCtx(ctx,"Adjusted Prices Refresh Complete", "duration_ms", duration.Milliseconds())
	return nil
}

// StreamAdjustedPrices makes an HTTP request to ESI and checks the response status code first.
// For HTTP 304 Not Modified responses, it returns early without streaming.
// For HTTP 200 OK responses, it performs a streaming decode of the ESI array and invokes
// onItem for each normalized AdjustedPrice. Callers typically persist within the callback.
// Returns the new ETag, whether it was not modified (HTTP 304), bytes read, and any error.
// cacheSecondsOut will be populated with parsed cache max-age from response headers if available.
func StreamAdjustedPrices(ctx context.Context, esiClient esiratelimiter.ClientInterface, etag string, onItem func(esitypes.AdjustedPrice) error, cacheSecondsOut *int) (string, bool, int64, error) {
	if esiClient == nil {
		return "", false, 0, errors.New("ESI client is nil")
	}
	if onItem == nil {
		return "", false, 0, errors.New("onItem callback is nil")
	}

	path := "/v1/markets/prices/"
	headers := map[string]string{
		"Accept":          "application/json",
		"Accept-Encoding": "gzip",
	}
	if etag != "" {
		headers["If-None-Match"] = etag
	}

	// Retry on transient errors with exponential backoff + jitter
	// Check for rate limit errors and reschedule if retryable
	var resp *http.Response
	maxAttempts := 4
	var err error

	logs.DebugCtx(ctx,"starting ESI request loop for adjusted prices", "path", path, "etag_provided", etag != "", "max_attempts", maxAttempts)

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		logs.DebugCtx(ctx,"making ESI request attempt", "attempt", attempt, "max_attempts", maxAttempts, "path", path)
		groupDesignation := esiratelimiter.GroupDesignation{}
		resp, err = esiClient.DoRequest(ctx, http.MethodGet, path, headers, groupDesignation)
		if err == nil {
			logs.DebugCtx(ctx,"ESI request succeeded", "attempt", attempt, "path", path)
			break
		}

		logs.DebugCtx(ctx,"ESI request failed",
			"attempt", attempt,
			"max_attempts", maxAttempts,
			"error", err,
			"error_type", fmt.Sprintf("%T", err),
			"path", path)

		// Check if this is a rate limit error - return early to avoid unnecessary retries
		if ShouldStopRetryOnRateLimit(ctx, err, attempt, path) {
			return "", false, 0, err
		}

		if attempt >= maxAttempts {
			logs.DebugCtx(ctx,"max attempts reached, returning error", "attempt", attempt, "max_attempts", maxAttempts, "error", err)
			return "", false, 0, err
		}
		// Exponential backoff: 500ms, 1s, 2s
		backoff := time.Duration(500*(1<<uint(attempt-1))) * time.Millisecond
		// Jitter: random 0-100ms
		jitter := time.Duration(rand.Intn(100)) * time.Millisecond
		waitTime := backoff + jitter
		logs.DebugCtx(ctx,"waiting before retry with exponential backoff", "attempt", attempt, "backoff", backoff, "jitter", jitter, "wait_time", waitTime)
		time.Sleep(waitTime)
	}
	if resp != nil {
		defer resp.Body.Close()
	}
	if resp == nil {
		return "", false, 0, errors.New("nil HTTP response")
	}

	// Check response status code first to avoid unnecessary streaming
	if resp.StatusCode == http.StatusNotModified {
		newETag := resp.Header.Get("ETag")
		if cacheSecondsOut != nil {
			*cacheSecondsOut = parseCacheSeconds(resp)
		}
		return newETag, true, 0, nil
	}
	if resp.StatusCode != http.StatusOK {
		newETag := resp.Header.Get("ETag")
		body, _ := io.ReadAll(resp.Body)
		return newETag, false, 0, errors.New(string(body))
	}

	// Extract ETag for successful responses
	newETag := resp.Header.Get("ETag")

	if cacheSecondsOut != nil {
		*cacheSecondsOut = parseCacheSeconds(resp)
	}

	// Handle gzip decompression if needed
	bodyReader := resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(resp.Body)
		if err != nil {
			return newETag, false, 0, err
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
		return newETag, false, cr.n, err
	}
	del, ok := tok.(json.Delim)
	if !ok || del != '[' {
		return newETag, false, cr.n, errors.New("invalid JSON: expected array start")
	}

	nowMs := time.Now().UnixMilli()
	for dec.More() {
		var item ESIAdjustedPrice
		if err := dec.Decode(&item); err != nil {
			return newETag, false, cr.n, err
		}
		// Only save adjusted_price as per user request
		m := esitypes.AdjustedPrice{
			TypeID:        item.TypeID,
			AdjustedPrice: item.AdjustedPrice,
			LastUpdated:   nowMs,
		}
		if err := onItem(m); err != nil {
			return newETag, false, cr.n, err
		}
	}
	// Consume end of array
	if _, err := dec.Token(); err != nil {
		return newETag, false, cr.n, err
	}

	return newETag, false, cr.n, nil
}
