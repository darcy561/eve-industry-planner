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

// GetJobsHandler handles GET /v1/jobs - retrieve all jobs for the authenticated user
func GetJobsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}
	m := apimetrics.GetAPIJobs()

	// Only allow GET requests
	if r.Method != http.MethodGet {
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for getJobs endpoint")
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

	database := clients.Mongo.Database(mongocore.DatabaseName)
	collection := database.Collection(mongocore.CollectionJobs)

	// Find all jobs for this accountID with retry
	filter := bson.M{"_meta.accountID": accountID}
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find jobs for account %s", accountID)

	var cursor *mongo.Cursor
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter, options.Find().SetSort(bson.M{"updatedAt": -1}))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query jobs", "error", err, "account_id", accountID)
		http.Error(w, "Failed to retrieve jobs", http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	// Decode all jobs
	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to decode jobs", "error", err, "account_id", accountID)
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
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	m.Successes.Inc(ctx)
	m.JobsRequested.Observe(ctx, float64(len(jobs)))
	logs.InfoCtx(ctx, "user jobs retrieved",
		"account_id", accountID,
		"job_count", len(jobs),
		"duration_ms", time.Since(start).Milliseconds())
}
