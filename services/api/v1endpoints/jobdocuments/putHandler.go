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

// PutJobDocumentsHandler handles PUT /api/v1/job-documents, writing each job on its own or, for a
// batch marked as one change, all of them or none.
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

	var reqBody models.JobWriteBatch

	if !helper.DecodeJSONOrBadRequest(w, r, metrics, &reqBody) {
		return
	}

	if len(reqBody.Jobs) == 0 {
		metrics.Error("no_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No jobs provided", "no jobs provided in batch request", "job_docs_put_no_jobs", "job_documents", nil, nil)
		return
	}

	const maxBatchSize = 100
	if len(reqBody.Jobs) > maxBatchSize && !reqBody.OneChange {
		metrics.Error("batch_too_large")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, fmt.Sprintf("Batch too large (max %d jobs)", maxBatchSize), "job documents batch too large", "job_docs_put_batch_too_large", "job_documents", nil, map[string]any{
			"count": len(reqBody.Jobs),
			"max":   maxBatchSize,
		})
		return
	}

	for _, write := range reqBody.Jobs {
		if err := write.Validate(); err != nil {
			metrics.Error("invalid_write")
			helper.RespondEndpointError(w, r, http.StatusBadRequest, "A write could not be read", "job documents put invalid write", "job_docs_put_invalid_write", "job_documents", err, nil)
			return
		}
	}

	logs.AttachDebugStep(r, "batch_validated", map[string]any{
		"batch_size": len(reqBody.Jobs),
	})

	sessionID := helper.AuthenticatedSessionID(r)
	wsClientID := helper.ExtractWSClientID(r)

	owner, ok := helper.RequestPlannerOwner(w, r, h.Mongo, h.EntityCipher, metrics, "job_documents")
	if !ok {
		return
	}

	var lockRejects []documentlock.LockHeldElsewhereItem
	if h.locks.Redis != nil {
		if sessionID == "" {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "job documents put lock gate: missing session", "job_docs_put_missing_session", "job_documents", nil, nil)
			return
		}
		jobIDs := make([]string, 0, len(reqBody.Jobs))
		jobGroupBypass := documentlock.JobGroupBypass{}
		for _, write := range reqBody.Jobs {
			jobIDs = append(jobIDs, write.JobID)
			if write.IncludedInGroup && write.GroupID != "" {
				jobGroupBypass[write.JobID] = write.GroupID
			}
		}
		rejects, lerr := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, owner, sessionID, eipmongo.CollectionJobDocuments, jobIDs, jobGroupBypass)
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
		lockRejects = rejects
		if len(rejects) > 0 && reqBody.OneChange {
			metrics.Error("lock_conflict")
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, rejects)
			return
		}
		if len(rejects) > 0 {
			reqBody.Jobs = dropHeldWrites(reqBody.Jobs, rejects)
			metrics.Error("lock_conflict")
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(jobIDs),
			"held":      len(rejects),
		})

		if len(reqBody.Jobs) == 0 {
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, rejects)
			return
		}
	}

	read := make([]readJobWrite, 0, len(reqBody.Jobs))
	var unreadable []string
	for _, write := range reqBody.Jobs {
		job, derr := decodeJobWrite(write)
		if derr != nil {
			unreadable = append(unreadable, write.JobID)
			continue
		}
		read = append(read, readJobWrite{Body: write, Job: *job})
	}

	decoded := make([]models.Job, len(read))
	for i := range read {
		decoded[i] = read[i].Job
	}
	if err := h.encryptJobs(decoded); err != nil {
		metrics.Error("entity_refs_failed")
		helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to convert entity ids to refs", "job_docs_entity_refs_failed", "job_documents", err, nil)
		return
	}

	for i := range read {
		read[i].Job = decoded[i]
	}

	wholeWrites, fieldWrites, unplannable := splitJobWrites(read)
	failed := append(unreadable, unplannable...)

	refuseUnreadableChange := func(unwritable []string) {
		metrics.Error("invalid_write")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "A write could not be read", "job documents change carries a write that cannot be made", "job_docs_put_change_unwritable", "job_documents", nil, map[string]any{
			"failed": unwritable,
		})
	}
	if reqBody.OneChange && len(failed) > 0 {
		refuseUnreadableChange(failed)
		return
	}

	if len(wholeWrites) == 0 && len(fieldWrites) == 0 {
		metrics.Error("no_valid_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid jobs to save", "no valid jobs in batch", "job_docs_put_no_valid_jobs", "job_documents", nil, nil)
		return
	}

	now := time.Now()
	var savedCount int
	var savedDocIDs []string
	var conflicts []eipmongo.RevisionConflict

	if reqBody.OneChange {
		applied, changeFailed, changeConflicts, cerr := h.Mongo.WriteJobChange(ctx, owner, accountID, wholeWrites, fieldWrites, now, sessionID, wsClientID)
		if cerr != nil {
			metrics.Error("database_error")
			helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to write job documents as one change", "job_docs_change_failed", "job_documents", cerr, nil)
			return
		}
		if len(changeFailed) > 0 {
			refuseUnreadableChange(changeFailed)
			return
		}
		conflicts = changeConflicts
		if len(conflicts) == 0 {
			savedCount = int(applied)
			savedDocIDs = append(writtenIDs(wholeWrites, func(job models.Job) string { return job.JobID }, nil, nil),
				writtenIDs(fieldWrites, func(write eipmongo.JobFieldWrite) string { return write.JobID }, nil, nil)...)
		}
	} else {
		if len(wholeWrites) > 0 {
			result, wholeFailed, wholeConflicts, cerr := h.Mongo.JobDocuments.BulkUpsertJobs(ctx, owner, accountID, wholeWrites, now, sessionID, wsClientID)
			if cerr != nil {
				metrics.Error("database_error")
				helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to bulk upsert job documents", "job_docs_upsert_failed", "job_documents", cerr, nil)
				return
			}
			if result != nil {
				savedCount += int(result.UpsertedCount + result.ModifiedCount)
			}
			failed = append(failed, wholeFailed...)
			conflicts = append(conflicts, wholeConflicts...)
			savedDocIDs = append(savedDocIDs, writtenIDs(wholeWrites, func(job models.Job) string { return job.JobID }, wholeFailed, wholeConflicts)...)
		}

		if len(fieldWrites) > 0 {
			applied, fieldFailed, fieldConflicts, ferr := h.Mongo.JobDocuments.BulkUpsertJobFields(ctx, owner, accountID, fieldWrites, now, sessionID, wsClientID)
			if ferr != nil {
				metrics.Error("database_error")
				helper.RespondEndpointServerError(w, r, "Failed to save jobs", "failed to write job document fields", "job_docs_field_write_failed", "job_documents", ferr, nil)
				return
			}
			savedCount += int(applied)
			failed = append(failed, fieldFailed...)
			conflicts = append(conflicts, fieldConflicts...)
			savedDocIDs = append(savedDocIDs, writtenIDs(fieldWrites, func(write eipmongo.JobFieldWrite) string { return write.JobID }, fieldFailed, fieldConflicts)...)
		}
	}

	switch refusalFor(len(lockRejects), len(conflicts)) {
	case refusalLockHeld:
		logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
			"saved":     savedCount,
			"held":      len(lockRejects),
			"conflicts": len(conflicts),
		})
		helper.RespondPartialLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, savedCount, savedDocIDs, lockRejects)
		return

	case refusalRevision:
		metrics.Error("revision_conflict")
		logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
			"saved":     savedCount,
			"failed":    len(failed),
			"conflicts": len(conflicts),
		})
		helper.RespondRevisionConflictJSON(w, r, eipmongo.CollectionJobDocuments, savedCount, savedDocIDs, conflicts)
		return
	}

	if len(failed) > 0 {
		logs.AttachHandlerCaveat(r, "batch_partial_failure", "some job documents failed validation in batch", map[string]any{
			"failed": len(failed),
			"total":  len(reqBody.Jobs),
		})
	}
	logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
		"saved":  savedCount,
		"failed": len(failed),
	})
	w.WriteHeader(http.StatusNoContent)

	metrics.Success()
	m.JobsSaved.Add(ctx, float64(savedCount))
	m.JobsRequested.Observe(ctx, float64(len(reqBody.Jobs)))

	logs.AttachHandlerSuccessDetail(r, "batch job documents upserted", map[string]any{
		"total":       len(reqBody.Jobs),
		"saved":       savedCount,
		"failed":      len(failed),
		"duration_ms": time.Since(start).Milliseconds(),
	})
}
