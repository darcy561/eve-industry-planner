package groups

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// PutGroupsHandler handles PUT /v1/groups (batch group upsert)
func PutGroupsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIGroups()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	// Extract accountID from JWT token
	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		logs.WarnCtx(ctx, "failed to extract accountID")
		return
	}

	// Parse request body
	var reqBody struct {
		Groups []models.Group `json:"groups"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		metrics.Error("invalid_json")
		logs.WarnCtx(ctx, "failed to decode batch groups JSON", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Groups) == 0 {
		metrics.Error("no_groups")
		logs.WarnCtx(ctx, "no groups provided in batch request")
		http.Error(w, "No groups provided", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.Groups) > maxBatchSize {
		metrics.Error("batch_too_large")
		logs.WarnCtx(ctx, "batch too large", "count", len(reqBody.Groups), "max", maxBatchSize)
		http.Error(w, fmt.Sprintf("Batch too large (max %d groups)", maxBatchSize), http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	wsClientID := helper.ExtractWSClientID(r)
	sessionID, _ := auth.ExtractSessionID(r)

	now := time.Now()
	result, failedCount, err := mongoput.BulkUpsertGroups(ctx, collection, accountID, reqBody.Groups, now, sessionID, wsClientID)
	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to bulk upsert groups", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save groups", err)
		return
	}
	if result == nil {
		metrics.Error("no_valid_groups")
		logs.WarnCtx(ctx, "no valid groups in batch")
		http.Error(w, "No valid groups to save", http.StatusBadRequest)
		return
	}
	savedCount := int(result.UpsertedCount + result.ModifiedCount)

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.GroupsSaved.Add(ctx, float64(savedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.Groups)))

	logs.InfoCtx(ctx, "batch groups upserted",
		"account_id", accountID,
		"total", len(reqBody.Groups),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
