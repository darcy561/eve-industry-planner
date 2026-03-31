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

// PutJobsHandler handles PUT /v1/jobs (batch job upsert)
func PutJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		Jobs []models.Job `json:"jobs"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc()
		logs.WarnCtx(r.Context(), "failed to decode batch jobs JSON", "error", err, "ip", r.RemoteAddr)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Jobs) == 0 {
		m.Errors.WithLabelValues("no_jobs").Inc()
		logs.WarnCtx(r.Context(), "no jobs provided in batch request", "ip", r.RemoteAddr)
		http.Error(w, "No jobs provided", http.StatusBadRequest)
		return
	}

	// Limit batch size to prevent abuse
	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc()
		logs.WarnCtx(r.Context(), "batch too large", "count", len(reqBody.Jobs), "max", maxBatchSize, "ip", r.RemoteAddr)
		http.Error(w, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	// Save to MongoDB using bulk write
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	now := time.Now()
	var bulkOps []mongo.WriteModel
	savedCount := 0
	failedCount := 0

	for _, job := range reqBody.Jobs {
		if job.JobID == "" {
			logs.WarnCtx(ctx, "skipping job with empty jobID", "account_id", accountID)
			failedCount++
			continue
		}
		// Update metadata fields on the struct before converting to BSON
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		job.MetaData.AccountID = accountID
		job.AccountID = accountID

		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID, "accountID": accountID}).
			SetUpdate(bson.M{"$set": job}).
			SetUpsert(true))
	}

	if len(bulkOps) == 0 {
		m.Errors.WithLabelValues("no_valid_jobs").Inc()
		logs.WarnCtx(r.Context(), "no valid jobs in batch", "ip", r.RemoteAddr)
		http.Error(w, "No valid jobs to save", http.StatusBadRequest)
		return
	}

	// Execute bulk write with retry
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk upsert %d jobs", len(bulkOps))

	var result *mongo.BulkWriteResult
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc()
		logs.ErrorCtx(ctx, "failed to bulk upsert jobs", "error", err, "account_id", accountID)
		http.Error(w, "Failed to save jobs", http.StatusInternalServerError)
		return
	}

	savedCount = int(result.UpsertedCount + result.ModifiedCount)

	m.Successes.Inc()
	m.JobsSaved.Add(float64(savedCount))
	m.JobsRequested.Observe(float64(len(reqBody.Jobs)))

	// Handle autosubscription - publish subscription request to NATS
	if r.Header.Get("AutoSubscribe") == "true" {
		if clients.JetStream != nil {
			// Collect all jobIDs from the batch
			jobIDs := make([]string, 0, len(reqBody.Jobs))
			for _, job := range reqBody.Jobs {
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

	logs.InfoCtx(r.Context(), "batch jobs upserted",
		"account_id", accountID,
		"total", len(reqBody.Jobs),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())

	// Return success status with no data
	w.WriteHeader(http.StatusNoContent)
}
