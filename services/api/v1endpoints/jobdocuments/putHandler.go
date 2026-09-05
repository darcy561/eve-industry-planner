package jobdocuments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// PutJobDocumentsHandler handles PUT /api/v1/job-documents — batch upsert into job_documents.
func (h *Handlers) PutJobDocumentsHandler(w http.ResponseWriter, r *http.Request) {
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
		Jobs []models.Job `json:"jobs"`
	}

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.Jobs) == 0 {
		metrics.Error("no_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No jobs provided", "no jobs provided in batch request", "job_docs_put_no_jobs", "job_documents", nil, nil)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), "job documents batch too large", "job_docs_put_batch_too_large", "job_documents", nil, map[string]any{
			"count": len(reqBody.Jobs),
			"max":   maxBatchSize,
		})
		return
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.Jobs),
	})

	sessionID := helper.AuthenticatedSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	if h.locks.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents put lock gate: missing session", "job_docs_put_missing_session", "job_documents", nil, nil)
			return
		}
		jobIDs := make([]string, 0, len(reqBody.Jobs))
		jobGroupBypass := documentlock.JobGroupBypass{}
		for _, j := range reqBody.Jobs {
			if j.JobID == "" {
				continue
			}
			jobIDs = append(jobIDs, j.JobID)
			if j.IncludedInGroup && j.GroupID != "" {
				jobGroupBypass[j.JobID] = j.GroupID
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionJobDocuments, jobIDs, jobGroupBypass)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents put lock gate: session required", "job_docs_put_session_required", "job_documents", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "job documents put lock gate failed", "job_docs_lock_gate_failed", "job_documents", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(jobIDs),
		})
	}

	if err := h.encryptJobs(reqBody.Jobs); err != nil {
		metrics.Error("entity_refs_failed")
		helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to convert entity ids to refs", "job_docs_entity_refs_failed", "job_documents", err, nil)
		return
	}
	for i := range reqBody.Jobs {
		reqBody.Jobs[i].SchemaVersion = models.JobSchemaCurrent
	}

	now := time.Now()
	result, failedCount, err := h.Mongo.JobDocuments.BulkUpsertJobs(ctx, accountID, reqBody.Jobs, now, sessionID, wsClientID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to bulk upsert job documents", "job_docs_upsert_failed", "job_documents", err, nil)
		return
	}
	if result == nil {
		metrics.Error("no_valid_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid jobs to save", "no valid jobs in batch", "job_docs_put_no_valid_jobs", "job_documents", nil, nil)
		return
	}
	savedCount := int(result.UpsertedCount + result.ModifiedCount)
	if failedCount > 0 {
		logs.AttachHandlerCaveat(r, "batch_partial_failure", "some job documents failed validation in batch", map[string]any{
			"failed": failedCount,
			"total":  len(reqBody.Jobs),
		})
	}
	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"saved":  savedCount,
		"failed": failedCount,
	})
	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.JobsSaved.Add(ctx, float64(savedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.Jobs)))

	logs.AttachHandlerSuccessDetail(r, "batch job documents upserted", map[string]any{
		"total":       len(reqBody.Jobs),
		"saved":       savedCount,
		"failed":      failedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
