package jobdocuments

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func collJobDocuments(clients *stackservices.Clients) *mongo.Collection {
	return clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobDocuments)
}

// GetPlannerJobDocumentsHandler handles GET /api/v1/job-documents/planner
func GetPlannerJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
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

	accountID := helper.AuthenticatedAccountID(r)

	filter := bson.M{
		"_meta.accountID":  accountID,
		"displayOnPlanner": true,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "planner jobs", metrics)
}

// GetJobDocumentsByGroupHandler handles GET /api/v1/job-documents/by-group/{groupID}
func GetJobDocumentsByGroupHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, groupID string) {
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

	accountID := helper.AuthenticatedAccountID(r)

	filter := bson.M{
		"_meta.accountID": accountID,
		"groupID":         groupID,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "jobs by group", metrics)
}

// GetJobDocumentByIDHandler handles GET /api/v1/job-documents/{jobID}
func GetJobDocumentByIDHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients, jobID string) {
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

	accountID := helper.AuthenticatedAccountID(r)

	collection := collJobDocuments(clients)
	doc, err := mongoget.LoadJobByID(ctx, collection, accountID, jobID)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "job document not found", "job_doc_not_found", "job_documents", nil, map[string]interface{}{"job_id": jobID})
			return
		}
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve job", "failed to query job document", "job_doc_query_failed", "job_documents", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"job_id": jobID,
	})

	if err := helper.EncodeJSON(w, doc); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode job document response", "job_doc_encode_failed", "job_documents", err, map[string]interface{}{"job_id": jobID})
		return
	}

	metrics.Success()
	m.JobsRequested.Observe(ctx, 1)
	logs.AttachHandlerSuccessDetail(r, "job document retrieved", map[string]interface{}{
		"job_id":      jobID,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}

// GetJobDocumentsByIDsHandler handles POST /api/v1/job-documents with { jobIDs: [] }
func GetJobDocumentsByIDsHandler(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
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

	accountID := helper.AuthenticatedAccountID(r)

	var reqBody struct {
		JobIDs []string `json:"jobIDs"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
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
		metrics.Error("no_job_ids")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No job IDs provided", "no job IDs provided for batch get", "job_docs_get_no_ids", "job_documents", nil, nil)
		return
	}

	const maxBatchSize = 200
	if len(uniqueIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), "job documents get batch too large", "job_docs_get_batch_too_large", "job_documents", nil, map[string]interface{}{
			"count": len(uniqueIDs),
			"max":   maxBatchSize,
		})
		return
	}

	filter := bson.M{
		"_meta.accountID": accountID,
		"_id":             bson.M{"$in": uniqueIDs},
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "jobs by ids", metrics)
}

func findJobs(
	ctx context.Context,
	w http.ResponseWriter,
	r *http.Request,
	clients *stackservices.Clients,
	filter bson.M,
	accountID string,
	start time.Time,
	label string,
	metrics *helper.RequestMetricsTracker,
) {
	m := apimetrics.GetAPIJobs()
	collection := collJobDocuments(clients)

	jobs, err := mongoget.LoadJobsByFilter(ctx, collection, accountID, label, filter)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve jobs", "failed to query job documents", "job_docs_query_failed", "job_documents", err, nil)
		return
	}

	logs.AttachDebugStep(r, "mongo_query_completed", map[string]interface{}{
		"kind":      label,
		"job_count": len(jobs),
	})

	if err := helper.EncodeJSON(w, jobs); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "failed to encode job documents response", "job_docs_encode_failed", "job_documents", err, map[string]interface{}{"kind": label})
		return
	}

	metrics.Success()
	m.JobsRequested.Observe(ctx, float64(len(jobs)))
	logs.AttachHandlerSuccessDetail(r, "job documents retrieved", map[string]interface{}{
		"kind":        label,
		"job_count":   len(jobs),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
