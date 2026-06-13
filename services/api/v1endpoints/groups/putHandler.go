package groups

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
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

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodPut)
	if !ok {
		return
	}

	var reqBody struct {
		Groups []models.Group `json:"groups"`
	}

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.Groups) == 0 {
		metrics.Error("no_groups")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No groups provided", "no groups provided in batch request", "groups_put_no_groups", "groups_put", nil, nil)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Groups) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d groups)", maxBatchSize), "groups batch too large", "groups_put_batch_too_large", "groups_put", nil, map[string]interface{}{
			"count": len(reqBody.Groups),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]interface{}{
		"batch_size": len(reqBody.Groups),
	})

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionUserJobGroups)

	wsClientID := helper.ExtractWSClientID(r)
	sessionID := helper.AuthenticatedSessionID(r)

	if clients.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "groups put lock gate: missing session", "groups_put_missing_session", "groups_put", nil, nil)
			return
		}
		var groupIDs []string
		for _, g := range reqBody.Groups {
			if g.GroupID != "" {
				groupIDs = append(groupIDs, g.GroupID)
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, clients.Redis, accountID, sessionID, mongocore.CollectionUserJobGroups, groupIDs, nil)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "groups put lock gate: session required", "groups_put_session_required", "groups_put", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "groups put lock gate failed", "groups_lock_gate_failed", "groups_put", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, mongocore.CollectionUserJobGroups, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]interface{}{
			"doc_count": len(groupIDs),
		})
	}

	now := time.Now()
	result, err := mongoput.BulkUpsertGroups(ctx, collection, accountID, reqBody.Groups, now, sessionID, wsClientID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save groups", "failed to bulk upsert groups", "groups_upsert_failed", "groups_put", err, nil)
		return
	}
	if result == nil {
		metrics.Error("no_valid_groups")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid groups to save", "no valid groups in batch", "groups_put_no_valid_groups", "groups_put", nil, nil)
		return
	}
	failedCount := result.FailedCount
	savedCount := int(result.UpsertedCount + result.ModifiedCount)

	if sessionID != "" && clients.Redis != nil && len(result.Deltas) > 0 {
		deps := documentlock.DepsFromServiceClients(clients)
		for _, delta := range result.Deltas {
			if len(delta.AddedJobIDs) == 0 {
				continue
			}
			held, herr := documentlock.LockHeldBySession(ctx, clients.Redis, accountID, mongocore.CollectionUserJobGroups, delta.GroupID, sessionID)
			if herr != nil {
				logs.AttachHandlerCaveat(r, "group_lock_cascade_check_failed", "group membership cascade: group lock check failed", map[string]interface{}{
					"error":    herr.Error(),
					"group_id": delta.GroupID,
				})
				continue
			}
			if !held {
				continue
			}
			documentlock.ReleaseStaleDependentJobLocksOnGroupMembershipAdded(ctx, deps, accountID, delta.GroupID, delta.AddedJobIDs, sessionID)
		}
	}

	if failedCount > 0 {
		logs.AttachHandlerCaveat(r, "batch_partial_failure", "some groups failed validation in batch", map[string]interface{}{
			"failed": failedCount,
			"total":  len(reqBody.Groups),
		})
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]interface{}{
		"saved":  savedCount,
		"failed": failedCount,
	})

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.GroupsSaved.Add(ctx, float64(savedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.Groups)))

	logs.AttachHandlerSuccessDetail(r, "batch groups upserted", map[string]interface{}{
		"total":       len(reqBody.Groups),
		"saved":       savedCount,
		"failed":      failedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
