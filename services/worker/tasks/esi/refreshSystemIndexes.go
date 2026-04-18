package tasks

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

// RefreshSystemIndexes fetches the latest industry system cost indices from ESI using a streaming decoder.
// It checks for HTTP 304 Not Modified responses to avoid unnecessary work when data hasn't changed.
// When data has changed, each item is persisted to Redis in the stream callback, and the ETag
// is saved after a successful pass. Cache headers are respected for scheduling future refreshes.
// Returns an error if processing fails - asynq will automatically retry on error.
func RefreshSystemIndexes(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	logs.InfoCtx(ctx, "system indexes task received")

	// Acquire a lock to prevent concurrent refreshes
	lockKey := "esi:industry_systems:refresh_lock"
	cleanup, shouldContinue := taskscore.AcquireRefreshLock(ctx, deps.Redis, lockKey)
	if !shouldContinue {
		// Lock already held - skip processing (not an error)
		return nil
	}
	defer cleanup()

	// Check server status before proceeding
	statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
	if err := HandleStatusCheckResult(ctx, statusResult, "system indexes refresh"); err != nil {
		return err
	}

	// Read previous ETag from Redis (if available) to leverage 304s.
	prevETag, err := rediscore.GetIndustrySystemsETag(ctx, deps.Redis)
	if err != nil {
		logs.WarnCtx(ctx, "failed to get previous ETag", "error", err)
	}

	start := time.Now()
	logs.DebugCtx(ctx, "System Indexes Refresh Started", "etag_used", prevETag)

	var cacheSeconds int
	newETag, notModified, _, err := StreamIndustrySystems(ctx, deps.ESIClient, prevETag, func(s esitypes.SystemIndexes) error {
		if err := rediscore.SaveIndustrySystemIndex(ctx, deps.Redis, s.SolarSystemID, s); err != nil {
			return err
		}
		return nil
	}, &cacheSeconds)
	if err != nil {
		return HandleStreamError(ctx, err, "system indexes refresh")
	}

	if notModified {
		logs.InfoCtx(ctx, "System Indexes Refresh Completed - Not Modified (ETag Match)")
		return nil
	}

	if err := rediscore.SaveIndustrySystemsETag(ctx, deps.Redis, newETag); err != nil {
		logs.ErrorCtx(ctx, "failed to save ETag", "error", err, "reason", "etag_save_error")
		return fmt.Errorf("failed to save ETag: %w", err)
	}

	// Save last updated timestamp
	if err := rediscore.SaveIndustrySystemsLastUpdated(ctx, deps.Redis, time.Now().UnixMilli()); err != nil {
		logs.WarnCtx(ctx, "failed to save last updated timestamp", "error", err, "reason", "last_updated_save_error")
		return fmt.Errorf("failed to save last updated timestamp: %w", err)
	}

	duration := time.Since(start)
	logs.InfoCtx(ctx, "System Indexes Refresh Complete", "duration_ms", duration.Milliseconds())
	return nil
}

// StreamIndustrySystems makes an HTTP request to ESI and checks the response status code first.
// For HTTP 304 Not Modified responses, it returns early without streaming.
// For HTTP 200 OK responses, it performs a streaming decode of the ESI array and invokes
// onItem for each normalized SystemIndexes. Callers typically persist within the callback.
// Returns the new ETag, whether it was not modified (HTTP 304), bytes read, and any error.
// cacheSecondsOut will be populated with parsed cache max-age from response headers if available.
func StreamIndustrySystems(ctx context.Context, esiClient esiratelimiter.ClientInterface, etag string, onItem func(esitypes.SystemIndexes) error, cacheSecondsOut *int) (string, bool, int64, error) {
	if esiClient == nil {
		return "", false, 0, errors.New("ESI client is nil")
	}
	if onItem == nil {
		return "", false, 0, errors.New("onItem callback is nil")
	}

	path := "/industry/systems/"
	headers := map[string]string{
		"Accept":               "application/json",
		"Accept-Encoding":      "gzip",
		"X-Compatibility-Date": esicore.CompatibilityDate,
	}
	if etag != "" {
		headers["If-None-Match"] = etag
	}

	groupDesignation := esiratelimiter.GroupDesignation{
		PrimaryGroup: "industry", // Industry endpoints
	}
	resp, err := DoRequestWithRetry(ctx, 4, path, func() (*http.Response, error) {
		return esiClient.DoRequest(ctx, http.MethodGet, path, headers, groupDesignation)
	})
	if err != nil {
		return "", false, 0, err
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
		s := esitypes.SystemIndexes{SolarSystemID: item.SolarSystemID, LastUpdated: nowMs}
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
