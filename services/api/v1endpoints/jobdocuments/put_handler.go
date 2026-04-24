package jobdocuments

import (
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PutJobDocumentsHandler handles PUT /api/v1/job-documents — batch upsert into user_job_documents.
func PutJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIJobs()

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		m.Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var reqBody struct {
		Jobs []models.Job `json:"jobs"`
	}

	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if len(reqBody.Jobs) == 0 {
		m.Errors.WithLabelValues("no_jobs").Inc(ctx)
		http.Error(w, "No jobs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc(ctx)
		http.Error(w, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	collection := collJobDocuments(clients)
	sessionID, _ := auth.ExtractSessionID(r)
	now := time.Now()
	var bulkOps []mongo.WriteModel
	savedCount := 0
	failedCount := 0

	for _, job := range reqBody.Jobs {
		if job.JobID == "" {
			failedCount++
			continue
		}
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		job.MetaData.AccountID = accountID
		if sessionID != "" {
			job.MetaData.SessionID = sessionID
		}

		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": accountID}).
			SetUpdate(bson.M{
				"$set": job,
				"$unset": bson.M{
					"accountID":        "",
					"deleted":          "",
					"deletedTimeStamp": "",
					"archived":         "",
					"archiveTimeStamp": "",
					"archiveProcessed": "",
				},
			}).
			SetUpsert(true))
	}

	if len(bulkOps) == 0 {
		m.Errors.WithLabelValues("no_valid_jobs").Inc(ctx)
		http.Error(w, "No valid jobs to save", http.StatusBadRequest)
		return
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk upsert %d job documents", len(bulkOps))

	var result *mongo.BulkWriteResult
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to bulk upsert job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save jobs", err)
		return
	}

	savedCount = int(result.UpsertedCount + result.ModifiedCount)
	w.WriteHeader(http.StatusNoContent)

	m.Successes.Inc(ctx)
	m.JobsSaved.Add(ctx, float64(savedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.Jobs)))

	logs.InfoCtx(ctx, "batch job documents upserted",
		"account_id", accountID,
		"total", len(reqBody.Jobs),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
