package v1endpoints

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"eve-industry-planner/api/helper"
	esitypes "eve-industry-planner/shared/core/esi/types"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"github.com/redis/go-redis/v9"
)

const (
	maxSystemIDs = 500
)

type SystemIndexesBody struct {
	RequestedIDs []string `json:"system_ids"`
}

// SystemIndexesHandler handles POST /api/v1/systemindexes/query with JSON body { system_ids: string[] }.
// Public: rate limit → handler. Client retries: withRequestRetries (408, 429, 5xx).
//
//	405 — not POST
//	400 — invalid JSON, missing system_ids, empty array, too many IDs, or invalid IDs
//	200 — JSON map of systemID → index rows; missing Redis keys appear as empty arrays (no per-id 404)
func (a *Handlers) SystemIndexesHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPISystemIndexes()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	if !helper.RequireMethod(w, r, http.MethodPost) {
		metrics.Error("method_not_allowed")
		return
	}

	reqBody, err := helper.ExtractRequestBody[SystemIndexesBody](r)
	if err != nil {
		metrics.Error("extraction_error")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err), "failed to extract system IDs", "system_indexes_extraction_error", "system_indexes", err, nil)
		return
	}

	validatedIDs, invalidCount := helper.ValidateIDs(reqBody.RequestedIDs)
	if len(validatedIDs) == 0 {
		metrics.Error("no_valid_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid system IDs provided", "no valid system IDs provided", "system_indexes_no_valid_ids", "system_indexes", nil, map[string]interface{}{
			"total_ids": len(reqBody.RequestedIDs), "invalid_ids": invalidCount,
		})
		return
	}

	if len(validatedIDs) > maxSystemIDs {
		metrics.Error("too_many_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Too many system IDs (max %d)", maxSystemIDs), "too many system IDs requested", "system_indexes_too_many_ids", "system_indexes", nil, map[string]interface{}{
			"count": len(validatedIDs), "max": maxSystemIDs,
		})
		return
	}

	if invalidCount > 0 {
		logs.AttachHandlerCaveat(r, "invalid_system_ids_filtered", "some invalid system IDs filtered out", map[string]interface{}{
			"total_ids":   len(reqBody.RequestedIDs),
			"valid_ids":   len(validatedIDs),
			"invalid_ids": invalidCount,
		})
	}

	logs.AttachDebugStep(r, "system_ids_validated", map[string]interface{}{
		"valid_count":   len(validatedIDs),
		"invalid_count": invalidCount,
	})

	result := make(map[string]esitypes.SystemIndexes, len(validatedIDs))
	systemsFound := 0
	systemsNotFound := 0
	missingIDs := make([]string, 0)

	for _, idStr := range validatedIDs {
		systemID, _ := strconv.ParseInt(idStr, 10, 32)

		var index esitypes.SystemIndexes
		err = rediscore.GetIndustrySystemIndex(ctx, a.Redis, int32(systemID), &index)
		if err != nil {
			systemsNotFound++
			missingIDs = append(missingIDs, idStr)
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

			if err != redis.Nil {
				metrics.Error("redis_error")
				logs.AttachHandlerCaveat(r, "redis_system_index_error", "redis error retrieving system index", map[string]interface{}{
					"error":     err.Error(),
					"system_id": systemID,
				})
			}
		} else {
			systemsFound++
		}
		result[idStr] = index
	}

	logs.AttachDebugStep(r, "redis_fetch_completed", map[string]interface{}{
		"systems_found":     systemsFound,
		"systems_not_found": systemsNotFound,
	})

	if err := helper.EncodeJSON(w, result); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode system index response", "system_index_encode_failed", "system_indexes", err, nil)
		return
	}

	duration := time.Since(start)
	m.SystemsRequested.Observe(ctx, float64(len(validatedIDs)))
	m.SystemIDsRequestedTotal.Add(ctx, float64(len(validatedIDs)))

	logs.AttachHandlerSuccessDetail(r, "system indexes request completed", map[string]interface{}{
		"requested_system_ids": validatedIDs,
		"missing_system_ids":   missingIDs,
		"system_ids_count":     len(validatedIDs),
		"systems_found":        systemsFound,
		"systems_not_found":    systemsNotFound,
		"duration_ms":          duration.Milliseconds(),
	})

	if duration > time.Second {
		apimetrics.LogRequestMetrics(ctx, "system_indexes", duration, "success",
			"system_ids_count", len(validatedIDs),
			"systems_found", systemsFound,
			"systems_not_found", systemsNotFound,
		)
	}
}
