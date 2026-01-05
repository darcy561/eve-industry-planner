package jobs

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/api/helper"
	"eve-industry-planner/api/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PostJobsHandler handles POST /v1/jobs - retrieve specific jobs by IDs
func PostJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	start := time.Now()
	m := metrics.GetAPIJobs()

	// Extract accountID from JWT token
	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc()
		logs.WarnCtx(r.Context(), "failed to extract accountID", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc()
		logs.WarnCtx(r.Context(), "failed to decode job IDs JSON", "error", err, "ip", r.RemoteAddr)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate that at least one jobID is provided
	if len(reqBody.JobIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc()
		logs.WarnCtx(r.Context(), "no job IDs provided for retrieval", "ip", r.RemoteAddr)
		http.Error(w, "At least one job ID is required", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.JobIDs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc()
		logs.WarnCtx(r.Context(), "batch too large", "count", len(reqBody.JobIDs), "max", maxBatchSize, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	// Query MongoDB for specific jobs belonging to this account
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	// Build filter: must match accountID AND be in the provided jobIDs list
	filter := bson.M{
		"accountID": accountID,
		"_id":       bson.M{"$in": reqBody.JobIDs},
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
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(ctx, "failed to query jobs", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to retrieve jobs", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	// Decode all jobs
	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc()
		logs.ErrorCtx(ctx, "failed to decode jobs", "error", err, "account_id", accountID, "ip", r.RemoteAddr)
		http.Error(w, "Failed to process jobs", http.StatusInternalServerError)
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
				if err := helper.PublishSubscriptionRequest(r.Context(), clients.JetStream, accountID, mongocore.CollectionJobs, jobIDs); err != nil {
					logs.WarnCtx(r.Context(), "failed to publish subscription request", "account_id", accountID, "error", err)
				}
			}
		} else {
			logs.WarnCtx(r.Context(), "JetStream not available for autosubscription", "account_id", accountID)
		}
	}

	m.Successes.Inc()
	m.JobsRequested.Observe(float64(len(jobs)))
	logs.InfoCtx(r.Context(), "user jobs retrieved",
		"account_id", accountID,
		"requested_count", len(reqBody.JobIDs),
		"found_count", len(jobs),
		"duration_ms", time.Since(start).Milliseconds())

	// Encode response (nginx handles compression)
	if err := helper.EncodeJSON(w, jobs); err != nil {
		logs.ErrorCtx(r.Context(), "failed to encode jobs response", "error", err, "account_id", accountID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}
