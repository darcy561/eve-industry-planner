package v1endpoints

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/api/api/helper"
	esitypes "eve-industry-planner/shared/core/esi/types"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/contextkeys"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"

	"github.com/redis/go-redis/v9"
)

const (
	maxSystemIDs = 500
)

type SystemIndexesBody struct {
	RequestedIDs []string `json:"system_ids"`
}

// SystemIndexesHandler handles POST requests for system indexes
// POST: expects array of system IDs in body ["12345", "67890"]
func SystemIndexesHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	// Get start time from context (set by middleware)
	ctx := r.Context()
	start, ok := ctx.Value(contextkeys.RequestStartTimeKey{}).(time.Time)
	if !ok || start.IsZero() {
		start = time.Now()
	}
	m := metrics.GetAPISystemIndexes()

	// Only accept POST requests
	if r.Method != http.MethodPost {
		duration := time.Since(start)
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		metrics.LogRequestMetrics("system_indexes", duration, "method_not_allowed",
			"method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "invalid method for system indexes endpoint", "method", r.Method, "path", r.URL.Path, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract request body into SystemIndexesBody struct
	reqBody, err := helper.ExtractRequestBody[SystemIndexesBody](r)
	if err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("extraction_error").Inc()
		metrics.LogRequestMetrics("system_indexes", duration, "extraction_error",
			"error", err, "method", r.Method, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "failed to extract system IDs", "error", err, "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Validate and clean system IDs
	validatedIDs, invalidCount := helper.ValidateIDs(reqBody.RequestedIDs)
	if len(validatedIDs) == 0 {
		duration := time.Since(start)
		m.Errors.WithLabelValues("no_valid_ids").Inc()
		metrics.LogRequestMetrics("system_indexes", duration, "no_valid_ids",
			"total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "no valid system IDs provided", "total_ids", len(reqBody.RequestedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
		http.Error(w, "No valid system IDs provided", http.StatusBadRequest)
		return
	}

	// Check if the number of system IDs is too many
	if len(validatedIDs) > maxSystemIDs {
		duration := time.Since(start)
		m.Errors.WithLabelValues("too_many_ids").Inc()
		metrics.LogRequestMetrics("system_indexes", duration, "too_many_ids",
			"count", len(validatedIDs), "max", maxSystemIDs, "ip", r.RemoteAddr)
		logs.WarnCtx(ctx, "too many system IDs requested", "count", len(validatedIDs), "max", maxSystemIDs, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Too many system IDs (max %d)", maxSystemIDs), http.StatusBadRequest)
		return
	}

	// Log if any invalid system IDs were filtered out
	if invalidCount > 0 {
		logs.InfoCtx(ctx, "some invalid system IDs filtered out", "total_ids", len(reqBody.RequestedIDs), "valid_ids", len(validatedIDs), "invalid_ids", invalidCount, "ip", r.RemoteAddr)
	}

	// Retrieve system indexes from Redis
	result := make(map[string]esitypes.SystemIndexes, len(validatedIDs))
	systemsFound := 0
	systemsNotFound := 0

	for _, idStr := range validatedIDs {
		systemID, _ := strconv.ParseInt(idStr, 10, 32) // Already validated, so no error check needed

		var index esitypes.SystemIndexes
		err = rediscore.GetIndustrySystemIndex(ctx, clients.Redis, int32(systemID), &index)
		if err != nil {
			// System not found in Redis - return blank index
			systemsNotFound++
			m.SystemsNotFoundByID.WithLabelValues(idStr).Inc()
			index = esitypes.SystemIndexes{
				SolarSystemID:    int32(systemID),
				LastUpdated:      0,
				Manufacturing:    0,
				ResearchTime:     0,
				ResearchMaterial: 0,
				Copying:          0,
				Invention:        0,
				Reaction:         0,
			}

			// Log error if it's not just a missing entry
			if err != redis.Nil {
				m.Errors.WithLabelValues("redis_error").Inc()
				// Will be logged when request completes
				logs.WarnCtx(ctx, "redis error retrieving system index", "error", err, "system_id", systemID, "ip", r.RemoteAddr)
			}
		} else {
			systemsFound++
		}
		result[idStr] = index
	}

	// Update metrics
	duration := time.Since(start)
	m.Requests.Observe(duration.Seconds())
	m.RequestsCount.Inc()
	m.SystemsRequested.Observe(float64(len(validatedIDs)))
	m.SystemsFound.Add(float64(systemsFound))
	m.SystemsNotFound.Add(float64(systemsNotFound))

	// Log per-request metrics for slow requests or with interesting data
	metrics.LogRequestMetrics("system_indexes", duration, "success",
		"method", r.Method,
		"system_ids_count", len(validatedIDs),
		"systems_found", systemsFound,
		"systems_not_found", systemsNotFound,
		"ip", r.RemoteAddr,
	)

	// Log successful request (detailed)
	logs.DebugCtx(ctx, "system indexes request completed",
		"method", r.Method,
		"system_ids_count", len(validatedIDs),
		"systems_found", systemsFound,
		"systems_not_found", systemsNotFound,
		"duration_ms", duration.Milliseconds(),
		"ip", r.RemoteAddr,
	)

	// Encode response (nginx handles compression)
	if err := helper.EncodeJSON(w, result); err != nil {
		duration := time.Since(start)
		m.Errors.WithLabelValues("encode_error").Inc()
		metrics.LogRequestMetrics("system_indexes", duration, "encode_error",
			"error", err, "ip", r.RemoteAddr)
		logs.ErrorCtx(ctx, "failed to encode response", "error", err, "ip", r.RemoteAddr)
	}
}
