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
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PostJobsHandler handles POST /v1/jobs - retrieve specific jobs by IDs
func PostJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIJobs()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		logs.WarnCtx(ctx, "failed to extract accountID", "error", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		logs.WarnCtx(ctx, "failed to decode job IDs JSON", "error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate that at least one jobID is provided
	if len(reqBody.JobIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc(ctx)
		logs.WarnCtx(ctx, "no job IDs provided for retrieval")
		http.Error(w, "At least one job ID is required", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.JobIDs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc(ctx)
		logs.WarnCtx(ctx, "batch too large", "count", len(reqBody.JobIDs), "max", maxBatchSize)
		http.Error(w, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	// Build filter: must match accountID AND be in the provided jobIDs list
	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": reqBody.JobIDs},
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find %d jobs for account %s", len(reqBody.JobIDs), accountID)

	var cursor *mongo.Cursor
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter, options.Find().SetSort(bson.M{"updatedAt": -1}))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query jobs", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve jobs", err)
		return
	}
	defer cursor.Close(ctx)

	// Decode all jobs
	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to decode jobs", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to process jobs", err)
		return
	}

	// Handle autosubscription - publish subscription request to NATS
	if r.Header.Get("Subscribe") == "true" || r.URL.Query().Get("subscribe") == "true" {
		if clients.JetStream != nil {
			// Collect all jobIDs from the retrieved jobs
			jobIDs := make([]string, 0, len(jobs))
			for _, job := range jobs {
				if job.JobID != "" {
					jobIDs = append(jobIDs, job.JobID)
				}
			}
			if len(jobIDs) > 0 {
				if err := helper.PublishSubscriptionRequest(ctx, clients.JetStream, accountID, mongocore.CollectionJobs, jobIDs); err != nil {
					logs.WarnCtx(ctx, "failed to publish subscription request", "account_id", accountID, "error", err)
				}
			}
		} else {
			logs.WarnCtx(ctx, "JetStream not available for autosubscription", "account_id", accountID)
		}
	}

	if err := helper.EncodeJSON(w, jobs); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to encode jobs response", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Internal server error", err)
		return
	}

	m.Successes.Inc(ctx)
	m.JobsRequested.Observe(ctx, float64(len(jobs)))
	logs.InfoCtx(ctx, "user jobs retrieved",
		"account_id", accountID,
		"requested_count", len(reqBody.JobIDs),
		"found_count", len(jobs),
		"duration_ms", time.Since(start).Milliseconds())
}
