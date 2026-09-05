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
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// DeleteGroupsHandler handles DELETE /v1/groups - delete specific groups by IDs for the authenticated user
func (h *Handlers) DeleteGroupsHandler(w http.ResponseWriter, r *http.Request) {
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

	accountID, ok := helper.RequireMethodAndAccountID(w, r, metrics, http.MethodDelete)
	if !ok {
		return
	}
	var reqBody struct {
		GroupIDs []string `json:"groupIDs"`
	}

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.GroupIDs) == 0 {
		metrics.Error("no_group_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "At least one group ID is required", "no group IDs provided for deletion", "groups_delete_no_ids", "groups_delete", nil, nil)
		return
	}

	const maxBatchSize = 200
	if len(reqBody.GroupIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d group IDs)", maxBatchSize), "groups delete batch too large", "groups_delete_batch_too_large", "groups_delete", nil, map[string]any{
			"count": len(reqBody.GroupIDs),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.GroupIDs),
	})

	collection := h.Mongo.Groups.Collection()
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.GroupIDs},
	}

	var resolvedIDs []string
	findErr := eipmongo.Retry(ctx, fmt.Sprintf("resolve groups for delete account %s", accountID), func() error {
		cur, err := collection.Find(ctx, filter, options.Find().SetProjection(bson.M{"_id": 1}))
		if err != nil {
			return err
		}
		defer cur.Close(ctx)
		resolvedIDs = resolvedIDs[:0]
		for cur.Next(ctx) {
			var doc struct {
				ID string `bson:"_id"`
			}
			if err := cur.Decode(&doc); err != nil {
				return err
			}
			if doc.ID != "" {
				resolvedIDs = append(resolvedIDs, doc.ID)
			}
		}
		return cur.Err()
	})
	if findErr != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to delete groups", "failed to resolve groups before delete", "groups_delete_resolve_failed", "groups_delete", findErr, nil)
		return
	}

	if len(resolvedIDs) == 0 {
		w.WriteHeader(http.StatusNoContent)
		metrics.Success()
		m.GroupsDeleted.Add(ctx, 0)
		m.GroupsRequested.Observe(ctx, float64(len(reqBody.GroupIDs)))
		logs.AttachHandlerSuccessDetail(r, "groups delete: nothing matched filter", map[string]any{
			"requested_count": len(reqBody.GroupIDs),
			"duration_ms":     time.Since(start).Milliseconds(),
		})
		return
	}

	sessionID := helper.AuthenticatedSessionID(r)
	if sessionID == "" {
		metrics.Error("auth_error")
		helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "groups delete lock gate: missing session", "groups_delete_missing_session", "groups_delete", nil, nil)
		return
	}
	if h.locks.Redis != nil {
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionJobGroups, resolvedIDs, nil)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "groups delete lock gate: session required", "groups_delete_session_required", "groups_delete", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "failed to check group doc lock before delete", "groups_delete_lock_gate_failed", "groups_delete", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobGroups, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(resolvedIDs),
		})
	}

	now := time.Now().UTC()
	wsClientID := helper.ExtractWSClientID(r)

	deletedCount64, err := h.Mongo.Groups.DeleteManyAfterStampingMeta(ctx, filter, now, sessionID, wsClientID,
		eipmongo.WithOpName(fmt.Sprintf("delete %d groups for account %s", len(resolvedIDs), accountID)))
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to delete groups", "failed to delete groups", "groups_delete_failed", "groups_delete", err, nil)
		return
	}

	deletedCount := int(deletedCount64)

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"deleted": deletedCount,
	})

	if h.locks.Redis != nil {
		for _, gid := range resolvedIDs {
			_ = documentlock.DeleteDocLock(ctx, h.locks.Redis, accountID, eipmongo.CollectionJobGroups, gid)
		}
	}

	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.GroupsDeleted.Add(ctx, float64(deletedCount))
	m.GroupsRequested.Observe(ctx, float64(len(reqBody.GroupIDs)))
	logs.AttachHandlerSuccessDetail(r, "groups deleted", map[string]any{
		"requested_count": len(reqBody.GroupIDs),
		"deleted_count":   deletedCount,
		"duration_ms":     time.Since(start).Milliseconds(),
	})
}
