package jobdocuments

import (
	"context"
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

func collJobDocuments(clients *shared.ServiceClients) *mongo.Collection {
	return clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobDocuments)
}

// GetPlannerJobDocumentsHandler handles GET /api/v1/job-documents/planner
func GetPlannerJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		apimetrics.GetAPIJobs().Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	filter := bson.M{
		"_meta.accountID":   accountID,
		"displayOnPlanner": true,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "planner jobs")
}

// GetJobDocumentsByGroupHandler handles GET /api/v1/job-documents/by-group/{groupID}
func GetJobDocumentsByGroupHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, groupID string) {
	ctx := r.Context()
	start, ok := logs.RequestStartTime(ctx)
	if !ok {
		start = time.Now()
	}

	accountID, err := auth.ExtractAccountID(r)
	if err != nil {
		apimetrics.GetAPIJobs().Errors.WithLabelValues("auth_error").Inc(ctx)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	filter := bson.M{
		"_meta.accountID": accountID,
		"groupID":         groupID,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "jobs by group")
}

// GetJobDocumentByIDHandler handles GET /api/v1/job-documents/{jobID}
func GetJobDocumentByIDHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, jobID string) {
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

	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             jobID,
	}

	collection := collJobDocuments(clients)
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find job %s for account %s", jobID, accountID)

	var doc models.Job
	err = mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		return collection.FindOne(ctx, filter).Decode(&doc)
	})
	if err != nil {
		if err == mongo.ErrNoDocuments {
			m.Errors.WithLabelValues("not_found").Inc(ctx)
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query job document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve job", err)
		return
	}

	if err := helper.EncodeJSON(w, doc); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	m.Successes.Inc(ctx)
	m.JobsRequested.Observe(ctx, 1)
	logs.InfoCtx(ctx, "job document retrieved",
		"account_id", accountID,
		"job_id", jobID,
		"duration_ms", time.Since(start).Milliseconds())
}

// GetJobDocumentsByIDsHandler handles POST /api/v1/job-documents with { jobIDs: [] }
func GetJobDocumentsByIDsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		JobIDs []string `json:"jobIDs"`
	}
	if err := helper.DecodeJSONRequest(r, &reqBody, helper.DefaultMaxBodySize); err != nil {
		m.Errors.WithLabelValues("invalid_json").Inc(ctx)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	uniqueIDs := make([]string, 0, len(reqBody.JobIDs))
	seen := make(map[string]struct{}, len(reqBody.JobIDs))
	for _, id := range reqBody.JobIDs {
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		uniqueIDs = append(uniqueIDs, id)
	}

	if len(uniqueIDs) == 0 {
		m.Errors.WithLabelValues("no_job_ids").Inc(ctx)
		http.Error(w, "No job IDs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 200
	if len(uniqueIDs) > maxBatchSize {
		m.Errors.WithLabelValues("batch_too_large").Inc(ctx)
		http.Error(w, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), http.StatusBadRequest)
		return
	}

	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": uniqueIDs},
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "jobs by ids")
}

func findJobs(ctx context.Context, w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, filter bson.M, accountID string, start time.Time, label string) {
	m := apimetrics.GetAPIJobs()
	collection := collJobDocuments(clients)

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("find %s for account %s", label, accountID)

	var cursor *mongo.Cursor
	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		cursor, err = collection.Find(ctx, filter, options.Find().SetSort(bson.M{"_meta.lastModified": -1}))
		return err
	})
	if err != nil {
		m.Errors.WithLabelValues("database_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to query job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve jobs", err)
		return
	}
	defer cursor.Close(ctx)

	var jobs []models.Job
	if err := cursor.All(ctx, &jobs); err != nil {
		m.Errors.WithLabelValues("decode_error").Inc(ctx)
		logs.ErrorCtx(ctx, "failed to decode jobs", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to process jobs", err)
		return
	}

	if err := helper.EncodeJSON(w, jobs); err != nil {
		m.Errors.WithLabelValues("encode_error").Inc(ctx)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	m.Successes.Inc(ctx)
	m.JobsRequested.Observe(ctx, float64(len(jobs)))
	logs.InfoCtx(ctx, "job documents retrieved",
		"account_id", accountID,
		"kind", label,
		"job_count", len(jobs),
		"duration_ms", time.Since(start).Milliseconds())
}
