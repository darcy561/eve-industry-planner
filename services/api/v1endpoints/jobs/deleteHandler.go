package jobs

import (
	"context"
	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"fmt"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// DeleteJobsHandler handles DELETE /v1/jobs - delete specific jobs by IDs for the authenticated user
func DeleteJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIJobs()

	// Only allow DELETE requests
	if r.Method != http.MethodDelete {
		m.Errors.WithLabelValues("method_not_allowed").Inc()
		logs.WarnCtx(r.Context(), "invalid method for deleteJobs endpoint", "method", r.Method, "ip", r.RemoteAddr)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body to get jobIDs (required)
	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}

	// Decode request body - jobIDs are required
	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc()
		logs.WarnCtx(r.Context(), "failed to decode delete jobs JSON", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate that at least one jobID is provided
	if len(reqBody.JobIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc()
		logs.WarnCtx(r.Context(), "no job IDs provided for deletion", "ip", r.RemoteAddr)
		http.Error(w, "At least one job ID is required", http.StatusBadRequest)
		return
	}

	// Delete specific jobs for this accountID using DeleteMany
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

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
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(ctx, "failed to delete jobs", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to delete jobs", http.StatusInternalServerError)
		return
	}

	deletedCount := int(result.DeletedCount)

	m.Successes.Inc()
	m.JobsDeleted.Add(float64(deletedCount))
	m.JobsRequested.Observe(float64(len(reqBody.JobIDs)))
	logs.InfoCtx(r.Context(), "jobs deleted", "account_id", accountID, "requested_count", len(reqBody.JobIDs), "deleted_count", deletedCount, "duration_ms", time.Since(start).Milliseconds())

	// Return success status with no content
	w.WriteHeader(http.StatusNoContent)
}
