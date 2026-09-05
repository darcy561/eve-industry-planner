package groups

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// PutGroupsHandler handles PUT /v1/groups (batch group upsert)
func (h *Handlers) PutGroupsHandler(w http.ResponseWriter, r *http.Request) {
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
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d groups)", maxBatchSize), "groups batch too large", "groups_put_batch_too_large", "groups_put", nil, map[string]any{
			"count": len(reqBody.Groups),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.Groups),
	})

	wsClientID := helper.ExtractWSClientID(r)
	sessionID := helper.AuthenticatedSessionID(r)

	if h.locks.Redis != nil {
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
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionJobGroups, groupIDs, nil)
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
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobGroups, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(groupIDs),
		})
	}

	now := time.Now()
	result, err := h.Mongo.Groups.BulkUpsertGroups(ctx, accountID, reqBody.Groups, now, sessionID, wsClientID)
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

	if sessionID != "" && h.locks.Redis != nil && len(result.Deltas) > 0 {
		for _, delta := range result.Deltas {
			if len(delta.AddedJobIDs) == 0 {
				continue
			}
			held, herr := documentlock.LockHeldBySession(ctx, h.locks.Redis, accountID, eipmongo.CollectionJobGroups, delta.GroupID, sessionID)
			if herr != nil {
				logs.AttachHandlerCaveat(r, "group_lock_cascade_check_failed", "group membership cascade: group lock check failed", map[string]any{
					"error":    herr.Error(),
					"group_id": delta.GroupID,
				})
				continue
			}
			if !held {
				continue
			}
			documentlock.ReleaseStaleDependentJobLocksOnGroupMembershipAdded(ctx, h.locks, accountID, delta.GroupID, delta.AddedJobIDs, sessionID)
		}
	}

	if failedCount > 0 {
		logs.AttachHandlerCaveat(r, "batch_partial_failure", "some groups failed validation in batch", map[string]any{
			"failed": failedCount,
			"total":  len(reqBody.Groups),
		})
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"saved":  savedCount,
		"failed": failedCount,
	})

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.GroupsSaved.Add(ctx, float64(savedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.Groups)))

	logs.AttachHandlerSuccessDetail(r, "batch groups upserted", map[string]any{
		"total":       len(reqBody.Groups),
		"saved":       savedCount,
		"failed":      failedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
