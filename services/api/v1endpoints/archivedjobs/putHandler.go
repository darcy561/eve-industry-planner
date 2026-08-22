package archivedjobs

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/api/helper"
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

// PutArchivedJobsHandler handles PUT /v1/archived-jobs — batch upsert into Mongo archivedJobs.
//
// This route is registered on the private mux group (apiServer): global middleware → rate limit →
// [middleware.AuthConstructor] → Router → PutArchivedJobsHandler. Statuses below are what clients
// should expect; align with frontend saveArchivedJobs (retries only 408, 429, 5xx).
//
// Before this handler:
//   - 429 — rate limiter (private rate); safe to retry with backoff
//   - 401 — auth middleware: missing/invalid Bearer JWT (do not retry until token refresh)
//
// Router (archivedjobs.Router):
//   - 405 — method other than PUT
//   - 404 — path not handled by this router
//
// This handler:
//   - 400 — malformed JSON, empty batch, batch >100, empty jobID, duplicate jobIDs
//   - 401 — should not occur if auth middleware passed (ExtractAccountID failure)
//   - 403 — job has non-empty _meta.accountID ≠ JWT account_id (do not retry)
//   - 500 — Mongo bulk write failure (retry)
//   - 204 — success
//
// For each job, _meta.archivedBy is set to the JWT account_id (who submitted the request), in addition
// to _meta.archivedAt, accountID, lastModified, and lastUpdatedBy.
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
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionUserJobDocuments, jobIDs, jobGroupBypass)
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
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionUserJobDocuments, rejects)
			return
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(jobIDs),
		})
	}

	now := time.Now().UTC()
	bulkOps := make([]mongodriver.WriteModel, 0, len(reqBody.Jobs))
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

	savedCount := int(result.UpsertedCount + result.ModifiedCount)
	nJobs := len(reqBody.Jobs)

	// The account's statistics are now stale. Queuing rather than recomputing here
	// keeps the write cheap and collapses a burst of archives into one rebuild.
	// A failure to queue is logged rather than failing the request: the jobs are
	// saved, and the next archive or a manual rebuild re-queues the account.
	if err := h.Mongo.QueueAccountRebuild(ctx, accountID, time.Now().UTC()); err != nil {
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
