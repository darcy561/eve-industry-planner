package groups

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/documentlock"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/models"
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

	// Parse request body
	var reqBody struct {
		Groups []models.Group `json:"groups"`
	}

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		logs.WarnCtx(ctx, "failed to decode batch groups JSON", "account_id", accountID)
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
	sessionID, sessErr := auth.ExtractSessionID(r)

	if clients.Redis != nil {
		if sessErr != nil || sessionID == "" {
			metrics.Error("auth_error")
			logs.WarnCtx(ctx, "groups put lock gate: missing session", "error", sessErr, "account_id", accountID)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		var groupIDs []string
		for _, g := range reqBody.Groups {
			if g.GroupID != "" {
				groupIDs = append(groupIDs, g.GroupID)
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, clients.Redis, accountID, sessionID, mongocore.CollectionUserJobGroups, groupIDs)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			metrics.Error("lock_error")
			logs.ErrorCtx(ctx, "groups put lock gate failed", "error", lerr, "account_id", accountID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to verify document lock", lerr)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			logs.WarnCtx(ctx, "groups put blocked: lock held elsewhere",
				"account_id", accountID,
				"requester_session_id", sessionID,
				"rejected_count", len(rejects))
			helper.RespondLockHeldElsewhereJSON(w, mongocore.CollectionUserJobGroups, rejects)
			return
		}
	}

	now := time.Now()
	result, err := mongoput.BulkUpsertGroups(ctx, collection, accountID, reqBody.Groups, now, sessionID, wsClientID)
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
				logs.WarnCtx(ctx, "group membership cascade: group lock check failed",
					"error", herr,
					"account_id", accountID,
					"group_id", delta.GroupID)
				continue
			}
			if !held {
				continue
			}
			documentlock.ReleaseStaleDependentJobLocksOnGroupMembershipAdded(ctx, deps, accountID, delta.GroupID, delta.AddedJobIDs, sessionID)
		}
	}

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
