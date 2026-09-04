package archivedjobs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// archivedJobStatsBatch bounds one bulk write of statistics rows. The archive
// batch is capped well below it, so a request is a single round trip.
const archivedJobStatsBatch = 200

// PutArchivedJobsHandler serves PUT /v1/archived-jobs, upserting a batch into
// archivedJobs.
//
// Statuses are what a client should expect; frontend saveArchivedJobs retries
// only 408, 429 and 5xx.
//
//   - 400 — malformed JSON, empty batch, batch >100, empty jobID, duplicate jobIDs
//   - 403 — a job's non-empty _meta.accountID is not the authenticated account
//   - 500 — Mongo bulk write failure
//   - 204 — success
//
// Each job is stamped with _meta.archivedBy, archivedAt, accountID, lastModified
// and lastUpdatedBy.
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

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), "archived jobs put: batch too large", "archived_jobs_put_batch_too_large", "archived_jobs_put", nil, map[string]any{
			"count": len(reqBody.Jobs),
			"max":   maxBatchSize,
		})
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
		if job.MetaData.AccountID != "" && job.MetaData.AccountID != accountID {
			metrics.Error("account_mismatch")
			helper.RespondEndpointError(w, r, http.StatusForbidden, fmt.Sprintf("Invalid job at index %d: _meta.accountID does not match the authenticated account", i), "archived jobs put: _meta.accountID does not match token", "archived_jobs_put_account_mismatch", "archived_jobs_put", nil, map[string]any{
				"index":               i,
				"job_id":              job.JobID,
				"job_meta_account_id": job.MetaData.AccountID,
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
	if h.locks.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "archived jobs put lock gate: missing session", "archived_jobs_put_missing_session", "archived_jobs_put", nil, nil)
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
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionAccountJobDocuments, jobIDs, jobGroupBypass)
		if lerr != nil {
			if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
				metrics.Error("auth_error")
				helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "archived jobs put lock gate: session required", "archived_jobs_put_session_required", "archived_jobs_put", lerr, nil)
				return
			}
			metrics.Error("lock_error")
			helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "archived jobs put lock gate failed", "archived_jobs_lock_gate_failed", "archived_jobs_put", lerr, nil)
			return
		}
		if len(rejects) > 0 {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionAccountJobDocuments, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(jobIDs),
		})
	}

	now := time.Now().UTC()
	bulkOps := make([]mongodriver.WriteModel, 0, len(reqBody.Jobs))
	statsRows := make([]models.ArchivedJobStats, 0, len(reqBody.Jobs))
	var unbuildable int
	for i := range reqBody.Jobs {
		job := &reqBody.Jobs[i]
		helper.PopulateRequestMeta(r, &job.MetaData.MetaData, accountID)
		job.MetaData.LastModified = now
		job.MetaData.LastUpdatedBy = accountID
		if job.MetaData.CreatedAt.IsZero() {
			job.MetaData.CreatedAt = now
		}
		job.MetaData.ArchivedAt = now
		job.MetaData.ArchivedBy = accountID

		bulkOps = append(bulkOps, mongodriver.NewUpdateOneModel().
			SetFilter(bson.M{"_id": job.JobID, "_meta.accountID": job.MetaData.AccountID}).
			SetUpdate(bson.M{"$set": job, "$unset": eipmongo.ArchivedJobsUpsertUnset}).
			SetUpsert(true))

		// The row is derived from the job and nothing else, so it is built where
		// the job already is. Leaving it to be discovered later would mean asking
		// "which of this account's jobs have no row", which costs a pass over the
		// whole archive on every archive — the cost the incremental path exists to
		// avoid.
		//
		// It is written uncounted: the fold queued below is what puts its figures
		// into the aggregates.
		row, rowErr := archivestats.NewAccountRow(*job, now)
		if rowErr != nil {
			unbuildable++
			continue
		}
		statsRows = append(statsRows, row)
	}

	collection := h.Mongo.ArchivedJobs.Collection()
	var result *mongodriver.BulkWriteResult
	err := eipmongo.Retry(ctx, fmt.Sprintf("bulk upsert %d archived jobs", len(bulkOps)), func() error {
		var e error
		result, e = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return e
	})
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to save archived jobs", "archived jobs put: bulk write", "archived_jobs_upsert_failed", "archived_jobs_put", err, nil)
		return
	}

	// After the jobs, so a row never describes a job that failed to save. A
	// failure here is not a failure to archive: the jobs are saved, and the
	// reconcile rota builds rows for archived jobs that have none.
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

	savedCount := int(result.UpsertedCount + result.ModifiedCount)
	nJobs := len(reqBody.Jobs)

	// The rows written above are not in the account's aggregates yet. Queuing
	// rather than folding them here keeps the write cheap and collapses a burst of
	// archives into one pass — the rows carry no contribution stamp, so whichever
	// pass runs finds all of them.
	//
	// A failure to queue is logged rather than failing the request: the jobs are
	// saved and their rows are still unstamped, so the next archive or a manual
	// rebuild picks them up.
	if err := h.Mongo.QueueOwnerWork(ctx, models.AccountOwner(accountID), eipmongo.StatsWorkDelta, time.Now().UTC()); err != nil {
		logs.AttachHandlerCaveat(r, "stats_rebuild_not_queued",
			"archived jobs saved but the statistics rebuild was not queued",
			map[string]any{"account_id": accountID, "error": err.Error()})
	}

	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"saved": savedCount,
		"jobs":  nJobs,
	})
	if savedCount != nJobs {
		logs.AttachHandlerCaveat(r, "mongo_write_count_mismatch", "mongo write count differs from batch size", map[string]any{
			"jobs":      nJobs,
			"saved_ops": savedCount,
		})
	}

	w.WriteHeader(http.StatusNoContent)
	metrics.Success()
	m.JobsSaved.Add(obsCtx, float64(savedCount))
	m.IndividualJobsArchived.Add(obsCtx, float64(nJobs))
	m.JobsRequested.Observe(obsCtx, float64(nJobs))

	logs.AttachHandlerSuccessDetail(r, "archived jobs put done", map[string]any{
		"jobs":        nJobs,
		"saved_ops":   savedCount,
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
