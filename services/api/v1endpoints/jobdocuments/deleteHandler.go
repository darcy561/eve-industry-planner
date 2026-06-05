package jobdocuments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
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

	accountID := helper.AuthenticatedAccountID(r)

	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.JobIDs) == 0 {
		metrics.Error("no_job_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No job IDs provided", "no job IDs provided for delete", "job_docs_delete_no_ids", "job_documents", nil, nil)
		return
	}

	const maxBatchSize = 200
	if len(reqBody.JobIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), "job documents delete batch too large", "job_docs_delete_batch_too_large", "job_documents", nil, map[string]interface{}{
			"count": len(reqBody.JobIDs),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]interface{}{
		"batch_size": len(reqBody.JobIDs),
	})

	collection := collJobDocuments(clients)
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.JobIDs},
	}

	now := time.Now().UTC()
	sessionID := helper.AuthenticatedSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	if clients.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents delete lock gate: missing session", "job_docs_delete_missing_session", "job_documents", nil, nil)
			return
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, clients.Redis, accountID, sessionID, mongocore.CollectionUserJobDocuments, reqBody.JobIDs)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents delete lock gate: session required", "job_docs_delete_session_required", "job_documents", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents delete lock gate failed", "job_docs_lock_gate_failed", "job_documents", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, mongocore.CollectionUserJobDocuments, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]interface{}{
			"doc_count": len(reqBody.JobIDs),
		})
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d job documents", len(reqBody.JobIDs))

	deletedCount, err := mongocore.DeleteManyAfterStampingMeta(ctx, retryConfig, collection, filter, now, sessionID, wsClientID)

	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to delete jobs", "failed to delete job documents", "job_docs_delete_failed", "job_documents", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]interface{}{
		"deleted": deletedCount,
	})

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "job documents deleted", map[string]interface{}{
		"requested":   len(reqBody.JobIDs),
		"deleted":     deletedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
