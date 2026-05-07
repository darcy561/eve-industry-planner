package jobdocuments

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/config"
	corecrypto "eve-industry-planner/shared/core/crypto"
	"eve-industry-planner/shared/core/sealedfields"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoget "eve-industry-planner/shared/core/mongo/get"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func collJobDocuments(clients *shared.ServiceClients) *mongo.Collection {
	return clients.Mongo.Database(mongocore.DatabaseName).Collection(mongocore.CollectionUserJobDocuments)
}

// GetPlannerJobDocumentsHandler handles GET /api/v1/job-documents/planner
func GetPlannerJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		return
	}

	filter := bson.M{
		"_meta.accountID":  accountID,
		"displayOnPlanner": true,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "planner jobs", metrics)
}

// GetJobDocumentsByGroupHandler handles GET /api/v1/job-documents/by-group/{groupID}
func GetJobDocumentsByGroupHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, groupID string) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		return
	}

	filter := bson.M{
		"_meta.accountID": accountID,
		"groupID":         groupID,
	}
	findJobs(ctx, w, r, clients, filter, accountID, start, "jobs by group", metrics)
}

// GetJobDocumentByIDHandler handles GET /api/v1/job-documents/{jobID}
func GetJobDocumentByIDHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients, jobID string) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		return
	}

	collection := collJobDocuments(clients)
	doc, err := mongoget.LoadJobByID(ctx, collection, accountID, jobID)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			metrics.Error("not_found")
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to query job document", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve job", err)
		return
	}
	cfg, err := config.LoadConfig()
	if err != nil {
		metrics.Error("identity_stitch_config_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to prepare job response", err)
		return
	}
	if err := stitchSingleJobIdentity(ctx, cfg.RefreshTokenKeyring, &doc); err != nil {
		logs.WarnCtx(ctx, "job identity stitch failed", "job_id", doc.JobID, "error", err)
	}

	if err := helper.EncodeJSON(w, doc); err != nil {
		metrics.Error("encode_error")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	metrics.Success()
	m.JobsRequested.Observe(ctx, 1)
	logs.InfoCtx(ctx, "job document retrieved",
		"account_id", accountID,
		"job_id", jobID,
		"duration_ms", time.Since(start).Milliseconds())
}

// GetJobDocumentsByIDsHandler handles POST /api/v1/job-documents with { jobIDs: [] }
func GetJobDocumentsByIDsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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

	accountID, ok := helper.RequireAccountID(w, r)
	if !ok {
		metrics.Error("auth_error")
		return
	}

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
		http.Error(w, "No job IDs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 200
	if len(uniqueIDs) > maxBatchSize {
		metrics.Error("batch_too_large")
		http.Error(w, fmt.Sprintf("Batch too large (max %d job IDs)", maxBatchSize), http.StatusBadRequest)
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
	clients *shared.ServiceClients,
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
		logs.ErrorCtx(ctx, "failed to query job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to retrieve jobs", err)
		return
	}
	if err := stitchJobsIdentity(ctx, jobs); err != nil {
		metrics.Error("identity_stitch_config_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to prepare jobs response", err)
		return
	}

	if err := helper.EncodeJSON(w, jobs); err != nil {
		metrics.Error("encode_error")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	metrics.Success()
	m.JobsRequested.Observe(ctx, float64(len(jobs)))
	logs.InfoCtx(ctx, "job documents retrieved",
		"account_id", accountID,
		"kind", label,
		"job_count", len(jobs),
		"duration_ms", time.Since(start).Milliseconds())
}

func stitchJobsIdentity(ctx context.Context, jobs []models.Job) error {
	cfg, err := config.LoadConfig()
	if err != nil {
		return err
	}
	for i := range jobs {
		if err := stitchSingleJobIdentity(ctx, cfg.RefreshTokenKeyring, &jobs[i]); err != nil {
			logs.WarnCtx(ctx, "job identity stitch failed", "job_id", jobs[i].JobID, "error", err)
		}
	}
	return nil
}

func stitchSingleJobIdentity(ctx context.Context, keyring *corecrypto.Keyring, job *models.Job) error {
	if job == nil {
		return nil
	}
	defer func() {
		// Never expose sealed payload to API clients.
		job.Sealed = nil
	}()
	if job.Sealed == nil {
		return nil
	}
	if keyring == nil {
		return fmt.Errorf("identity keyring is nil")
	}
	plaintext, err := sealedfields.Open(keyring, job.Sealed)
	if err != nil {
		return err
	}
	if err := entityids.Apply(plaintext, job); err != nil {
		return err
	}
	return nil
}
