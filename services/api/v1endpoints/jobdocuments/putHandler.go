package jobdocuments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/core/documentlock"
	mongocore "eve-industry-planner/shared/core/mongo"
	mongoput "eve-industry-planner/shared/core/mongo/put"
	"eve-industry-planner/shared/core/sealedfields/entityids"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/shared"
	"eve-industry-planner/shared/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// PutJobDocumentsHandler handles PUT /api/v1/job-documents — batch upsert into user_job_documents.
func PutJobDocumentsHandler(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
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
		Jobs []models.Job `json:"jobs"`
	}

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.Jobs) == 0 {
		metrics.Error("no_jobs")
		http.Error(w, "No jobs provided", http.StatusBadRequest)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		metrics.Error("batch_too_large")
		http.Error(w, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), http.StatusBadRequest)
		return
	}
	cfg, err := config.LoadConfig()
	if err != nil {
		metrics.Error("config_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to load identity encryption config", err)
		return
	}
	if cfg.RefreshTokenKeyring == nil {
		metrics.Error("config_error")
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Identity encryption keyring is not configured", fmt.Errorf("refresh token keyring is nil"))
		return
	}
	jobSealer := entityids.NewJobIdentitySealer(cfg.RefreshTokenKeyring)
	for i := range reqBody.Jobs {
		if err := models.UpgradeJob(&reqBody.Jobs[i], jobSealer); err != nil {
			metrics.Error("job_upgrade_failed")
			http.Error(w, fmt.Sprintf("Invalid job at index %d for schema upgrade", i), http.StatusBadRequest)
			return
		}
	}

	collection := collJobDocuments(clients)
	sessionID, sessErr := auth.ExtractSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	if clients.Redis != nil {
		if sessErr != nil || sessionID == "" {
			metrics.Error("auth_error")
			logs.WarnCtx(ctx, "job documents put lock gate: missing session", "error", sessErr, "account_id", accountID)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		jobIDs := make([]string, 0, len(reqBody.Jobs))
		for _, j := range reqBody.Jobs {
			if j.JobID != "" {
				jobIDs = append(jobIDs, j.JobID)
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, clients.Redis, accountID, sessionID, mongocore.CollectionUserJobDocuments, jobIDs)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			metrics.Error("lock_error")
			logs.ErrorCtx(ctx, "job documents put lock gate failed", "error", lerr, "account_id", accountID)
			logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to verify document lock", lerr)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			logs.WarnCtx(ctx, "job documents put blocked: lock held elsewhere",
				"account_id", accountID,
				"requester_session_id", sessionID,
				"rejected_count", len(rejects))
			helper.RespondLockHeldElsewhereJSON(w, mongocore.CollectionUserJobDocuments, rejects)
			return
		}
	}

	now := time.Now()
	result, failedCount, err := mongoput.BulkUpsertJobDocuments(ctx, collection, accountID, reqBody.Jobs, now, sessionID, wsClientID)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			metrics.Error("request_canceled")
			logs.WarnCtx(ctx, "job documents bulk upsert canceled",
				"account_id", accountID,
				"error", err)
			http.Error(w, "Request canceled", http.StatusRequestTimeout)
			return
		}
		metrics.Error("database_error")
		logs.ErrorCtx(ctx, "failed to bulk upsert job documents", "error", err, "account_id", accountID)
		logs.RespondHTTPError(w, r, http.StatusInternalServerError, "Failed to save jobs", err)
		return
	}
	if result == nil {
		metrics.Error("no_valid_jobs")
		http.Error(w, "No valid jobs to save", http.StatusBadRequest)
		return
	}
	savedCount := int(result.UpsertedCount + result.ModifiedCount)
	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.JobsSaved.Add(ctx, float64(savedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.Jobs)))

	logs.InfoCtx(ctx, "batch job documents upserted",
		"account_id", accountID,
		"total", len(reqBody.Jobs),
		"saved", savedCount,
		"failed", failedCount,
		"duration_ms", time.Since(start).Milliseconds())
}
