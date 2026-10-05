package archivedjobs

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/statistics"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// archivedJobStatsBatch bounds one bulk write of statistics rows.
const archivedJobStatsBatch = 200

// PutArchivedJobsHandler serves PUT /v1/archived-jobs, moving jobs off the planner into the archive in
// one transaction that refuses the whole batch when any job moved since it was read.
func (h *Handlers) PutArchivedJobsHandler(w http.ResponseWriter, r *http.Request) {
	obsCtx := r.Context()
	start := helper.RequestStartOrNow(obsCtx)
	m := apimetrics.GetAPIArchivedJobs()
	metrics := helper.BeginRequestMetrics(obsCtx, helper.RequestMetricsHooks{
		ObserveDuration: func(ctx context.Context, ms float64) { m.Requests.Observe(ctx, ms) },
		IncRequests:     func(ctx context.Context) { m.RequestsCount.Inc(ctx) },
		IncSuccesses:    func(ctx context.Context) { m.Successes.Inc(ctx) },
		IncErrors:       func(ctx context.Context, reason string) { m.Errors.WithLabelValues(reason).Inc(ctx) },
	})
	defer metrics.Finish()

	ctx := obsCtx
	accountID := helper.AuthenticatedAccountID(r)

	var reqBody struct {
		Jobs []models.Job `json:"jobs"`
	}
	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.Jobs) == 0 {
		metrics.Error("no_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No jobs provided", "archived jobs put: empty batch", "archived_jobs_put_no_jobs", "archived_jobs_put", nil, nil)
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	seenJobID := make(map[string]struct{}, len(reqBody.Jobs))
	for i := range reqBody.Jobs {
		job := &reqBody.Jobs[i]
		if job.JobID == "" {
			metrics.Error("empty_job_id")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid job at index %d: jobID is required", i), "archived jobs put: batch rejected (empty jobID)", "archived_jobs_put_empty_job_id", "archived_jobs_put", nil, map[string]any{"index": i})
			return
		}
		if _, dup := seenJobID[job.JobID]; dup {
			metrics.Error("duplicate_job_id")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid batch: duplicate jobID %q", job.JobID), "archived jobs put: batch rejected (duplicate jobID)", "archived_jobs_put_duplicate_job_id", "archived_jobs_put", nil, map[string]any{"index": i, "job_id": job.JobID})
			return
		}
		if job.MetaData.Owner.ID != "" && job.MetaData.Owner.ID != accountID {
			metrics.Error("account_mismatch")
			helper.RespondEndpointError(w, r, http.StatusForbidden, fmt.Sprintf("Invalid job at index %d: _meta.owner does not match the authenticated account", i), "archived jobs put: _meta.owner does not match token", "archived_jobs_put_account_mismatch", "archived_jobs_put", nil, map[string]any{
				"index":          i,
				"job_id":         job.JobID,
				"job_meta_owner": job.MetaData.Owner.Key(),
			})
			return
		}
		if h.EntityCipher == nil {
			metrics.Error("entity_refs_unavailable")
			helper.RespondEndpointServerError(w, r, "Failed to archive jobs", "entity ref helper is not configured", "archived_jobs_put_entity_refs_missing", "archived_jobs_put", nil, nil)
			return
		}
		if err := jobidentity.Encrypt(job, h.EntityCipher); err != nil {
			metrics.Error("entity_refs_failed")
			helper.RespondEndpointServerError(w, r, "Failed to archive jobs", "failed to convert entity ids to refs", "archived_jobs_put_entity_refs_failed", "archived_jobs_put", err, map[string]any{"index": i, "job_id": job.JobID})
			return
		}
		job.SchemaVersion = models.JobSchemaCurrent

		seenJobID[job.JobID] = struct{}{}
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.Jobs),
	})

	sessionID := helper.AuthenticatedSessionID(r)
	owner, ok := helper.RequestPlannerOwner(w, r, h.Mongo, h.EntityCipher, metrics, "archived_jobs")
	if !ok {
		return
	}

	rejects, ok := helper.GateDocumentLocks(w, r, metrics, h.locks.Redis, owner, eipmongo.CollectionJobDocuments, "archived_jobs_put", models.JobIDsOf(reqBody.Jobs))
	if !ok || helper.RefuseHeldDocuments(w, r, metrics, eipmongo.CollectionJobDocuments, rejects) {
		return
	}

	now := time.Now().UTC()
	statsRows := make([]models.ArchivedJobStats, 0, len(reqBody.Jobs))
	var unbuildable int
	for i := range reqBody.Jobs {
		job := &reqBody.Jobs[i]
		helper.PopulateRequestMeta(r, &job.MetaData.MetaData, owner)
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		if job.MetaData.CreatedAt.IsZero() {
			job.MetaData.CreatedAt = now
		}
		job.MetaData.ArchivedAt = now
		job.MetaData.ArchivedBy = accountID

		row, rowErr := statistics.NewRow(*job, now)
		if rowErr != nil {
			unbuildable++
			continue
		}
		statsRows = append(statsRows, row)
	}

	unarchivable, conflicts, err := h.Mongo.ArchiveJobs(ctx, owner, reqBody.Jobs, now, sessionID, helper.ExtractWSClientID(r))
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save archived jobs", "archived jobs put: archive move", "archived_jobs_upsert_failed", "archived_jobs_put", err, nil)
		return
	}
	if len(unarchivable) > 0 {
		metrics.Error("no_revision")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "A job was sent without the revision it was read at", "archived jobs put: job without a revision", "archived_jobs_put_no_revision", "archived_jobs_put", nil, map[string]any{
			"failed": unarchivable,
		})
		return
	}
	if len(conflicts) > 0 {
		metrics.Error("revision_conflict")
		helper.RespondRevisionConflictJSON(w, r, eipmongo.CollectionJobDocuments, 0, nil, conflicts)
		return
	}

	if len(statsRows) > 0 {
		if rowErr := h.Mongo.WriteStatsRows(ctx, statsRows, archivedJobStatsBatch); rowErr != nil {
			logs.AttachHandlerCaveat(r, "stats_rows_not_written",
				"archived jobs saved but their statistics rows were not",
				map[string]any{"account_id": accountID, "rows": len(statsRows), "error": rowErr.Error()})
		}
	}
	if unbuildable > 0 {
		logs.AttachHandlerCaveat(r, "stats_rows_unbuildable",
			"some archived jobs carry no figures to derive statistics from",
			map[string]any{"account_id": accountID, "jobs": unbuildable})
	}

	nJobs := len(reqBody.Jobs)

	if err := h.Mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkDelta, time.Now().UTC()); err != nil {
		logs.AttachHandlerCaveat(r, "stats_rebuild_not_queued",
			"archived jobs saved but the statistics rebuild was not queued",
			map[string]any{"account_id": accountID, "error": err.Error()})
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"saved": nJobs,
		"jobs":  nJobs,
	})
	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	m.JobsSaved.Add(obsCtx, float64(nJobs))
	m.IndividualJobsArchived.Add(obsCtx, float64(nJobs))
	m.JobsRequested.Observe(obsCtx, float64(nJobs))

	logs.AttachHandlerSuccessDetail(r, "archived jobs put done", map[string]any{
		"jobs":        nJobs,
		"saved_ops":   nJobs,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
