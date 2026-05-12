package jobdocuments

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
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
	sessionID, _ := auth.ExtractSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

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
