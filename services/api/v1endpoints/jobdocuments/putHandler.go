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
		Jobs []models.JobWriteBody `json:"jobs"`
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

	// A write that names no job cannot be answered for: a refusal names the
	// documents it refused, and one with no id is nameable nowhere. So the batch
	// is refused whole rather than dropping it and leaving the caller to wonder
	// which of its writes never happened.
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

	// Resolved before the lock gate as well as the write: a lock names the planner
	// the document belongs to, so the gate has to ask about the one being written.
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
		// A held job is dropped from the batch rather than refusing the batch. One
		// member editing one job used to cost every other job in the same save,
		// which on a shared planner is most of a close: the jobs nobody holds are
		// exactly the ones the writer may still save.
		lockRejects = rejects
		if len(rejects) > 0 {
			reqBody.Jobs = dropHeldWrites(reqBody.Jobs, rejects)
			metrics.Error("lock_conflict")
		}
		logs.AttachDebugStep(r, "lock_gate_passed", map[string]any{
			"doc_count": len(jobIDs),
			"held":      len(rejects),
		})

		// Nothing survived the gate, so there is no write to make and the refusal
		// is the whole answer.
		if len(reqBody.Jobs) == 0 {
			helper.RespondLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, rejects)
			return
		}
	}

	// Decoded before anything is written, so a document this model cannot read
	// is named rather than costing the batch. The typed decode is what bounds
	// what a body may say, and the cipher runs before a write is planned so a
	// field-scoped write carries the stored form of an id rather than the one
	// the client sent.
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

	now := time.Now()
	var savedCount int
	var savedDocIDs []string
	var conflicts []eipmongo.RevisionConflict

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

	if len(wholeWrites) == 0 && len(fieldWrites) == 0 {
		metrics.Error("no_valid_jobs")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "No valid jobs to save", "no valid jobs in batch", "job_docs_put_no_valid_jobs", "job_documents", nil, nil)
		return
	}

	// Two refusals can arrive from one batch and a response carries one of them;
	// refusalFor decides which, and says why.
	switch refusalFor(len(lockRejects), len(conflicts)) {
	case refusalLockHeld:
		logs.AttachDebugStep(r, "mongo_write_completed", map[string]any{
			"saved":     savedCount,
			"held":      len(lockRejects),
			"conflicts": len(conflicts),
		})
		helper.RespondPartialLockHeldElsewhereJSON(w, r, eipmongo.CollectionJobDocuments, savedCount, savedDocIDs, lockRejects)
		return

	// A refused write is answered even when the rest of the batch landed: a job
	// whose document moved is the one thing the caller cannot discover from a
	// success, and it is what the client reconciles against.
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
