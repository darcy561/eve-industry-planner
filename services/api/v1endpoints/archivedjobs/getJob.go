package archivedjobs

import (
	"context"
	"errors"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// jobResponse nests the job so the response can grow without reshaping.
type jobResponse struct {
	Job models.Job `json:"job"`
}

// GetArchivedJobHandler handles GET /api/v1/archived-jobs/{jobID}. A job owned
// by another account is reported as not found rather than forbidden.
func (h *Handlers) GetArchivedJobHandler(w http.ResponseWriter, r *http.Request, jobID string) {
	ctx := r.Context()
	m := apimetrics.GetAPIArchivedJobs()
	metrics := helper.BeginRequestMetrics(ctx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	accountID := helper.AuthenticatedAccountID(r)

	if jobID == "" {
		metrics.Error("empty_job_id")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "jobID is required", "archived job get: empty jobID", "archived_jobs_get_empty_job_id", "archived_jobs_get", nil, nil)
		return
	}
	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "archived job get: mongo client missing", "archived_jobs_mongo_unavailable", "archived_jobs_get", errors.New("mongo client missing"), nil)
		return
	}

	scope, err := accountArchiveScope(h.Mongo, accountID)
	if err != nil {
		metrics.Error("scope_unavailable")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve archived job", "archived job get: archive scope unavailable", "archived_jobs_get_scope_unavailable", "archived_jobs_get", err, nil)
		return
	}

	job, err := loadArchivedJob(ctx, scope, jobID)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to retrieve archived job", "archived job get: query failed", "archived_jobs_get_query_failed", "archived_jobs_get", err, map[string]any{"job_id": jobID})
		return
	}
	if job == nil {
		metrics.Error("not_found")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Archived job not found", "archived job get: no such archived job", "archived_jobs_get_not_found", "archived_jobs_get", nil, map[string]any{"job_id": jobID})
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, jobResponse{Job: *job}); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "archived job get: encode failed", "archived_jobs_get_encode_failed", "archived_jobs_get", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "archived job retrieved", map[string]any{"job_id": jobID})
}
