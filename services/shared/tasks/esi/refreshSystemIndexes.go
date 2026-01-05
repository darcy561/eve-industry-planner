package esi

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

	esicore "eve-industry-planner/shared/core/esi"
	esiratelimiter "eve-industry-planner/shared/core/esi/rateLimiter"
	natscore "eve-industry-planner/shared/core/nats"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	tasks "eve-industry-planner/shared/tasks"
)

// ESICostIndice represents an individual cost index returned by ESI.
type ESICostIndice struct {
	Activity  string  `json:"activity"`
	CostIndex float64 `json:"cost_index"`
}

// ESIIndustrySystem mirrors each item in the ESI industry systems response.
type ESIIndustrySystem struct {
	CostIndices   []ESICostIndice `json:"cost_indices"`
	SolarSystemID int32           `json:"solar_system_id"`
}

// SystemIndexes is the normalized structure used internally.
type SystemIndexes struct {
	SolarSystemID    int32   `json:"solar_system_id"`
	LastUpdated      int64   `json:"lastUpdated"`
	Manufacturing    float64 `json:"manufacturing,omitempty"`
	ResearchTime     float64 `json:"researching_time_efficiency,omitempty"`
	ResearchMaterial float64 `json:"researching_material_efficiency,omitempty"`
	Copying          float64 `json:"copying,omitempty"`
	Invention        float64 `json:"invention,omitempty"`
	Reaction         float64 `json:"reaction,omitempty"`
}

// RefreshSystemIndexes fetches the latest industry system cost indices from ESI using a streaming decoder.
// It checks for HTTP 304 Not Modified responses to avoid unnecessary work when data hasn't changed.
// When data has changed, each item is persisted to Redis in the stream callback, and the ETag
// is saved after a successful pass. Cache headers are respected for scheduling future refreshes.
func RefreshSystemIndexes(natsMessage MessageInterface, deps *TaskDependencies) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	deliveryCount := uint64(0)
	if natsMessage != nil {
		deliveryCount = natsMessage.NumDelivered()
	}
	logs.Info("system indexes message received", "delivery_count", deliveryCount)

	// Acquire a lock to prevent concurrent refreshes
	lockKey := "esi:industry_systems:refresh_lock"
	cleanup, shouldContinue := tasks.AcquireRefreshLock(ctx, deps.Redis, lockKey, natsMessage, deliveryCount)
	if !shouldContinue {
		return
	}
	defer cleanup()

	// Check server status before proceeding
	statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
	if !HandleStatusCheckResult(statusResult, natsMessage, "system indexes refresh", deliveryCount) {
		return
	}

	// Read previous ETag from Redis (if available) to leverage 304s.
	prevETag, err := rediscore.GetIndustrySystemsETag(ctx, deps.Redis)
	if err != nil {
		logs.Warn("failed to get previous ETag", "error", err)
	}

	var count int
	lastProgress := time.Now()
	start := time.Now()
	logs.Debug("System Indexes Refresh Started", "etag_used", prevETag)
	// initial heartbeat so long fetches don't time out
	if natsMessage != nil {
		_ = natsMessage.InProgress()
	}

	var totalBytes int64
	var cacheSeconds int
	newETag, notModified, bytesRead, err := StreamIndustrySystems(ctx, natsMessage, deps.ESIClient, prevETag, func(s SystemIndexes) error {
		if err := rediscore.SaveIndustrySystemIndex(ctx, deps.Redis, s.SolarSystemID, s); err != nil {
			return err
		}
		count++
		// send progress heartbeat at most every 5s
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
		HandleStreamError(err, natsMessage, "system indexes refresh", deliveryCount, metrics.GetESIIndustrySystems().Errors)
		return
	}

	if notModified {
		logs.Info("System Indexes Refresh Completed - Not Modified (ETag Match)")
		if natsMessage != nil {
			if ackErr := natsMessage.Ack(); ackErr != nil {
				logs.Warn("failed to ack message (not modified)", "error", ackErr)
			} else {
				logs.Info("message acknowledged (not modified)", "delivery_count", deliveryCount)
			}
		}
		m := metrics.GetESIIndustrySystems()
		m.Requests.Observe(time.Since(start).Seconds())
		m.Bytes.Add(float64(totalBytes))
		// Update metrics if cache headers available (for monitoring)
		if cacheSeconds > 0 {
			nextRefreshMillis := time.Now().Add(time.Duration(cacheSeconds) * time.Second).UnixMilli()
			metrics.GetESIIndustrySystems().NextRefresh.Set(float64(nextRefreshMillis))
		}
		return
	}

	if err := rediscore.SaveIndustrySystemsETag(ctx, deps.Redis, newETag); err != nil {
		logs.Error("failed to save ETag, nacking with backoff", "error", err, "reason", "etag_save_error", "delivery_count", deliveryCount)
		if natsMessage != nil {
			natscore.NackWithBackoff(natsMessage)
		}
		metrics.GetESIIndustrySystems().Errors.WithLabelValues("etag_save").Inc()
		return
	}

	// Save last updated timestamp
	if err := rediscore.SaveIndustrySystemsLastUpdated(ctx, deps.Redis, time.Now().UnixMilli()); err != nil {
		logs.Warn("failed to save last updated timestamp, nacking with backoff", "error", err, "reason", "last_updated_save_error", "delivery_count", deliveryCount)
		if natsMessage != nil {
			natscore.NackWithBackoff(natsMessage)
		}
		metrics.GetESIIndustrySystems().Errors.WithLabelValues("last_updated_save").Inc()
		return
	}

	// Update metrics if cache headers available (for monitoring)
	if cacheSeconds > 0 {
		nextRefreshMillis := time.Now().Add(time.Duration(cacheSeconds) * time.Second).UnixMilli()
		metrics.GetESIIndustrySystems().NextRefresh.Set(float64(nextRefreshMillis))
	}

	// Acknowledge message completion
	if natsMessage != nil {
		if ackErr := natsMessage.Ack(); ackErr != nil {
			logs.Warn("failed to ack message (success)", "error", ackErr, "delivery_count", deliveryCount)
		} else {
			logs.Debug("message acknowledged (success)", "delivery_count", deliveryCount)
		}
	}

	duration := time.Since(start)
	m := metrics.GetESIIndustrySystems()
	m.Requests.Observe(duration.Seconds())
	m.Bytes.Add(float64(totalBytes))
	m.Items.Add(float64(count))
	m.LastUpdated.Set(float64(time.Now().UnixMilli()))
	logs.Info("System Indexes Refresh Complete", "duration_ms", duration.Milliseconds())
}

// StreamIndustrySystems makes an HTTP request to ESI and checks the response status code first.
// For HTTP 304 Not Modified responses, it returns early without streaming.
// For HTTP 200 OK responses, it performs a streaming decode of the ESI array and invokes
// onItem for each normalized SystemIndexes. Callers typically persist within the callback.
// Returns the new ETag, whether it was not modified (HTTP 304), bytes read, and any error.
// cacheSecondsOut will be populated with parsed cache max-age from response headers if available.
func StreamIndustrySystems(ctx context.Context, natsMessage MessageInterface, esiClient esiratelimiter.ClientInterface, etag string, onItem func(SystemIndexes) error, cacheSecondsOut *int) (string, bool, int64, error) {
	if esiClient == nil {
		return "", false, 0, errors.New("ESI client is nil")
	}
	if onItem == nil {
		return "", false, 0, errors.New("onItem callback is nil")
	}

	path := "/v1/industry/systems/"
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

	logs.Debug("starting ESI request loop for industry systems", "path", path, "etag_provided", etag != "", "max_attempts", maxAttempts)

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		logs.Debug("making ESI request attempt", "attempt", attempt, "max_attempts", maxAttempts, "path", path)
		groupDesignation := esiratelimiter.GroupDesignation{
			PrimaryGroup: "industry", // Industry endpoints
		}
		resp, err = esiClient.DoRequest(ctx, http.MethodGet, path, headers, groupDesignation)
		if err == nil {
			logs.Debug("ESI request succeeded", "attempt", attempt, "path", path)
			break
		}

		logs.Debug("ESI request failed",
			"attempt", attempt,
			"max_attempts", maxAttempts,
			"error", err,
			"error_type", fmt.Sprintf("%T", err),
			"path", path)

		// Check if this is a rate limit error - return early to avoid unnecessary retries
		if ShouldStopRetryOnRateLimit(err, attempt, path) {
			return "", false, 0, err
		}

		if attempt >= maxAttempts {
			logs.Debug("max attempts reached, returning error", "attempt", attempt, "max_attempts", maxAttempts, "error", err)
			return "", false, 0, err
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
		var item ESIIndustrySystem
		if err := dec.Decode(&item); err != nil {
			return newETag, false, cr.n, err
		}
		s := SystemIndexes{SolarSystemID: item.SolarSystemID, LastUpdated: nowMs}
		for _, ci := range item.CostIndices {
			switch ci.Activity {
			case "manufacturing":
				s.Manufacturing = ci.CostIndex
			case "researching_time_efficiency":
				s.ResearchTime = ci.CostIndex
			case "researching_material_efficiency":
				s.ResearchMaterial = ci.CostIndex
			case "copying":
				s.Copying = ci.CostIndex
			case "invention":
				s.Invention = ci.CostIndex
			case "reaction":
				s.Reaction = ci.CostIndex
			}
		}
		if err := onItem(s); err != nil {
			return newETag, false, cr.n, err
		}
	}
	// Consume end of array
	if _, err := dec.Token(); err != nil {
		return newETag, false, cr.n, err
	}

	return newETag, false, cr.n, nil
}
