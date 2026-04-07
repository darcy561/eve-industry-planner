package jobs

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

// DeleteJobsHandler handles DELETE /v1/jobs - delete specific jobs by IDs for the authenticated user
func DeleteJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIJobs()

	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for deleteJobs endpoint")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body to get jobIDs (required)
	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}

	// Decode request body - jobIDs are required
	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode delete jobs JSON", "error", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate that at least one jobID is provided
	if len(reqBody.JobIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc(ctx)
		logs.WarnCtx(ctx, "no job IDs provided for deletion")
		http.Error(w, "At least one job ID is required", http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	// Build filter: must match accountID AND be in the provided jobIDs list
	filter := bson.M{
		"accountID": accountID,
		"_id":       bson.M{"$in": reqBody.JobIDs},
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("delete %d jobs for account %s", len(reqBody.JobIDs), accountID)

	var result *mongo.DeleteResult
	if err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.DeleteMany(ctx, filter)
		return err
	}); err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to delete jobs", "error", err, "account_id", accountID)
		http.Error(w, "Failed to delete jobs", http.StatusInternalServerError)
		return
	}

	deletedCount := int(result.DeletedCount)

	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	m.JobsDeleted.Add(ctx, float64(deletedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.JobIDs)))
	logs.InfoCtx(ctx, "jobs deleted", "account_id", accountID, "requested_count", len(reqBody.JobIDs), "deleted_count", deletedCount, "duration_ms", time.Since(start).Milliseconds())
}
