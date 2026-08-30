package archivedjobs

import (
	"context"
	"errors"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// restoreResponse is the same shape whichever route produced it.
type restoreResponse struct {
	RestoredJobIDs []string `json:"restoredJobIDs"`
	// Jobs lets the calling client apply the restore itself: the realtime
	// broadcast skips the client that caused it.
	Jobs []models.Job `json:"jobs"`
	// Conflicts and Unresolved are reported, not errors.
	Conflicts  []esiConflict  `json:"conflicts,omitempty"`
	Groups     []models.Group `json:"groups,omitempty"`
	Unresolved []string       `json:"unresolved,omitempty"`
}

// restoreScope is how a request selected what to restore.
type restoreScope int

const (
	restoreScopeJob restoreScope = iota
	restoreScopeGroup
	restoreScopeRelated
)

// RestoreArchivedJobsHandler handles the three restore routes, which differ only
// in how they select jobs.
func (h *Handlers) RestoreArchivedJobsHandler(w http.ResponseWriter, r *http.Request, scope restoreScope, id string) {
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

	if id == "" {
		metrics.Error("empty_id")
		helper.RespondEndpointError(w, r, http.StatusBadRequest, "An id is required", "archived jobs restore: empty id", "archived_jobs_restore_empty_id", "archived_jobs_restore", nil, nil)
		return
	}
	if h.Mongo == nil {
		metrics.Error("mongo_client_missing")
		helper.RespondEndpointError(w, r, http.StatusServiceUnavailable, "Service unavailable", "archived jobs restore: mongo client missing", "archived_jobs_mongo_unavailable", "archived_jobs_restore", errors.New("mongo client missing"), nil)
		return
	}
	if h.EntityCipher == nil {
		metrics.Error("entity_refs_unavailable")
		helper.RespondEndpointServerError(w, r, "Failed to restore", "entity ref helper is not configured", "archived_jobs_restore_entity_refs_missing", "archived_jobs_restore", nil, nil)
		return
	}

	archive, err := accountArchiveScope(h.Mongo, accountID)
	if err != nil {
		metrics.Error("scope_unavailable")
		helper.RespondEndpointServerError(w, r, "Failed to restore", "archived jobs restore: archive scope unavailable", "archived_jobs_restore_scope_unavailable", "archived_jobs_restore", err, nil)
		return
	}

	jobs, unresolved, err := selectJobsToRestore(ctx, archive, scope, id)
	if err != nil {
		metrics.Error("database_error")
		helper.RespondEndpointServerError(w, r, "Failed to restore", "archived jobs restore: selection failed", "archived_jobs_restore_select_failed", "archived_jobs_restore", err, map[string]any{"id": id})
		return
	}
	if len(jobs) == 0 {
		metrics.Error("not_found")
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Nothing to restore", "archived jobs restore: no archived jobs matched", "archived_jobs_restore_not_found", "archived_jobs_restore", nil, map[string]any{"id": id})
		return
	}

	sessionID := helper.AuthenticatedSessionID(r)
	collection, rejects, lerr := h.restoreLockRejects(ctx, accountID, sessionID, jobs)
	if lerr != nil {
		if errors.Is(lerr, documentlock.ErrSessionRequiredForLockGate) {
			metrics.Error("auth_error")
			helper.RespondEndpointError(w, r, http.StatusUnauthorized, "Unauthorized", "archived jobs restore lock gate: session required", "archived_jobs_restore_session_required", "archived_jobs_restore", lerr, nil)
			return
		}
		metrics.Error("lock_error")
		helper.RespondEndpointServerError(w, r, "Failed to verify document lock", "archived jobs restore lock gate failed", "archived_jobs_restore_lock_gate_failed", "archived_jobs_restore", lerr, nil)
		return
	}
	if len(rejects) > 0 {
		metrics.Error("lock_conflict")
		helper.RespondLockHeldElsewhereJSON(w, r, collection, rejects)
		return
	}

	result, err := restoreJobs(ctx, h, restoreRequest{
		Archive:    archive,
		SessionID:  sessionID,
		WSClientID: helper.ExtractWSClientID(r),
		Jobs:       jobs,
	})
	if err != nil {
		metrics.Error("restore_failed")
		helper.RespondEndpointServerError(w, r, "Failed to restore", "archived jobs restore failed", "archived_jobs_restore_failed", "archived_jobs_restore", err, map[string]any{"id": id})
		return
	}

	resp := restoreResponse{
		RestoredJobIDs: result.RestoredJobIDs,
		Jobs:           result.Jobs,
		Conflicts:      result.Conflicts,
		Groups:         result.Groups,
		Unresolved:     unresolved,
	}

	w.WriteHeader(http.StatusOK)
	if err := helper.EncodeJSON(w, resp); err != nil {
		metrics.Error("encode_error")
		helper.RespondEndpointServerError(w, r, "Internal server error", "archived jobs restore: encode failed", "archived_jobs_restore_encode_failed", "archived_jobs_restore", err, nil)
		return
	}
	metrics.Success()
	logs.AttachHandlerSuccessDetail(r, "archived jobs restored", map[string]any{
		"restored":   len(result.RestoredJobIDs),
		"conflicts":  len(result.Conflicts),
		"unresolved": len(unresolved),
		"groups":     len(result.Groups),
	})
}

// restoreLockRejects reports documents the restore would write that another
// session is holding.
//
// An archived job holds no lock of its own, so its group's lock stands for it and
// only an ungrouped job is gated on its own document.
func (h *Handlers) restoreLockRejects(ctx context.Context, accountID, sessionID string, jobs []models.Job) (string, []documentlock.LockHeldElsewhereItem, error) {
	if h.locks.Redis == nil {
		return "", nil, nil
	}
	if sessionID == "" {
		return "", nil, documentlock.ErrSessionRequiredForLockGate
	}

	groupIDs, _ := groupJobsByGroupID(jobs)
	if len(groupIDs) > 0 {
		rejects, err := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionAccountJobGroups, groupIDs, nil)
		if err != nil {
			return "", nil, err
		}
		if len(rejects) > 0 {
			return eipmongo.CollectionAccountJobGroups, rejects, nil
		}
	}

	loose := make([]string, 0, len(jobs))
	for i := range jobs {
		if jobs[i].JobID == "" || jobs[i].GroupID != "" {
			continue
		}
		loose = append(loose, jobs[i].JobID)
	}
	if len(loose) == 0 {
		return "", nil, nil
	}
	rejects, err := documentlock.CollectLockHeldElsewhereRejects(ctx, h.locks.Redis, accountID, sessionID, eipmongo.CollectionAccountJobDocuments, loose, nil)
	if err != nil {
		return "", nil, err
	}
	if len(rejects) > 0 {
		return eipmongo.CollectionAccountJobDocuments, rejects, nil
	}
	return "", nil, nil
}

// selectJobsToRestore reads the addressed documents, returning the jobs and the
// ids the walk could not resolve. Each job carries its own group, so the
// selection does not name one.
func selectJobsToRestore(ctx context.Context, archive archiveScope, scope restoreScope, id string) ([]models.Job, []string, error) {
	switch scope {
	case restoreScopeJob:
		job, err := loadArchivedJob(ctx, archive, id)
		if err != nil {
			return nil, nil, err
		}
		if job == nil {
			return nil, nil, nil
		}
		return []models.Job{*job}, nil, nil

	case restoreScopeGroup:
		// Everything the archive still holds for the group.
		jobs, err := loadArchivedJobsByFilter(ctx, ArchivedJobQuery{
			Scope:   archive,
			GroupID: id,
		})
		if err != nil {
			return nil, nil, err
		}
		return jobs, nil, nil

	case restoreScopeRelated:
		summaries, err := listAllArchivedSummaries(ctx, archive)
		if err != nil {
			return nil, nil, err
		}
		reachable := relatedJobIDsInArchive(summaries, id)
		if len(reachable) == 0 {
			return nil, nil, nil
		}
		jobs, err := loadArchivedJobsByIDs(ctx, archive, reachable)
		if err != nil {
			return nil, nil, err
		}
		return jobs, unresolvedLinks(summaries, reachable), nil
	}
	return nil, nil, nil
}

// unresolvedLinks names ids the restored jobs point at that the archive does not
// hold, which happens when a chain straddles the archive boundary.
func unresolvedLinks(summaries []ArchivedJobSummary, restored []string) []string {
	inArchive := make(map[string]struct{}, len(summaries))
	for _, s := range summaries {
		inArchive[s.JobID] = struct{}{}
	}
	restoredSet := make(map[string]struct{}, len(restored))
	for _, id := range restored {
		restoredSet[id] = struct{}{}
	}

	seen := map[string]struct{}{}
	var out []string
	for _, s := range summaries {
		if _, restoring := restoredSet[s.JobID]; !restoring {
			continue
		}
		for _, linked := range s.RelatedJobIDs() {
			if linked == "" {
				continue
			}
			if _, held := inArchive[linked]; held {
				continue
			}
			if _, dup := seen[linked]; dup {
				continue
			}
			seen[linked] = struct{}{}
			out = append(out, linked)
		}
	}
	return out
}
