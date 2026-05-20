package jobdocuments

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
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
)

// DeleteJobDocumentsHandler handles DELETE /api/v1/job-documents with { jobIDs: [] }.
func DeleteJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start := helper.RequestStartOrNow(ctx)
	m := apimetrics.GetAPIJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		return
	}

	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.JobIDs) == 0 {
		metrics.Error("no_job_ids")
		http.Error(w, "No job IDs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 200
	if len(reqBody.JobIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		http.Error(w, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	collection := collJobDocuments(clients)
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.JobIDs},
	}

	now := time.Now().UTC()
	sessionID, sessErr := auth.ExtractSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	if clients.Redis != nil {
		if sessErr != nil || sessionID == "" {
			metrics.Error("auth_error")
			logs.WarnCtx(ctx, "job documents delete lock gate: missing session", "error", sessErr, "account_id", accountID)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, clients.Redis, accountID, sessionID, mongocore.CollectionUserJobDocuments, reqBody.JobIDs)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			metrics.Error("lock_error")
			logs.ErrorCtx(ctx, "job documents delete lock gate failed", "error", lerr, "account_id", accountID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to verify document lock", lerr)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			logs.WarnCtx(ctx, "job documents delete blocked: lock held elsewhere",
				"account_id", accountID,
				"requester_session_id", sessionID,
				"rejected_count", len(rejects))
			helper.RespondLockHeldElsewhereJSON(w, mongocore.CollectionUserJobDocuments, rejects)
			return
		}
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d job documents", len(reqBody.JobIDs))

	deletedCount, err := mongocore.DeleteManyAfterStampingMeta(ctx, retryConfig, collection, filter, now, sessionID, wsClientID)

	if err != nil {
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to delete job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete jobs", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.InfoCtx(ctx, "job documents deleted",
		"account_id", accountID,
		"requested", len(reqBody.JobIDs),
		"deleted", deletedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
