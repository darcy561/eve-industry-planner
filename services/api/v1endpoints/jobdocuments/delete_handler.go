package jobdocuments

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// DeleteJobDocumentsHandler handles DELETE /api/v1/job-documents
func DeleteJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIJobs()

	if r.Method != http.MethodDelete {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(reqBody.JobIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc(ctx)
		http.Error(w, "At least one job ID is required", http.StatusBadRequest)
		return
	}

	collection := collJobDocuments(clients)
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.JobIDs},
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d job documents for account %s", len(reqBody.JobIDs), accountID)

	var result *mongo.DeleteResult
	if err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.DeleteMany(ctx, filter)
		return err
	}); err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to delete job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to delete jobs", err)
		return
	}

	deletedCount := int(result.DeletedCount)
	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	m.JobsDeleted.Add(ctx, float64(deletedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.JobIDs)))
	logs.InfoCtx(ctx, "job documents deleted", "account_id", accountID,
		"requested_count", len(reqBody.JobIDs), "deleted_count", deletedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
