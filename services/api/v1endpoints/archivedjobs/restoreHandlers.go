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

// restoreResponse is the same shape whichever route produced it.
type restoreResponse struct {
	RestoredJobIDs []string `json:"restoredJobIDs"`
	// Conflicts and Unresolved are reported, not errors.
	Conflicts  []esiConflict `json:"conflicts,omitempty"`
	Group      *models.Group `json:"group,omitempty"`
	Unresolved []string      `json:"unresolved,omitempty"`
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

	jobs, unresolved, groupID, err := selectJobsToRestore(ctx, archive, scope, id)
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

	result, err := restoreJobs(ctx, h, restoreRequest{
		Archive:    archive,
		SessionID:  helper.AuthenticatedSessionID(r),
		WSClientID: helper.ExtractWSClientID(r),
		Jobs:       jobs,
		GroupID:    groupID,
	})
	if err != nil {
		metrics.Error("restore_failed")
		helper.RespondEndpointServerError(w, r, "Failed to restore", "archived jobs restore failed", "archived_jobs_restore_failed", "archived_jobs_restore", err, map[string]any{"id": id})
		return
	}

	resp := restoreResponse{
		RestoredJobIDs: result.RestoredJobIDs,
		Conflicts:      result.Conflicts,
		Group:          result.Group,
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
		"group_id":   groupID,
	})
}

// selectJobsToRestore reads the addressed documents, returning the jobs, ids the
// walk could not resolve, and the group to rejoin (group scope only).
func selectJobsToRestore(ctx context.Context, archive archiveScope, scope restoreScope, id string) ([]models.Job, []string, string, error) {
	switch scope {
	case restoreScopeJob:
		job, err := loadArchivedJob(ctx, archive, id)
		if err != nil {
			return nil, nil, "", err
		}
		if job == nil {
			return nil, nil, "", nil
		}
		return []models.Job{*job}, nil, "", nil

	case restoreScopeGroup:
		jobs, err := loadArchivedJobsByFilter(ctx, ArchivedJobQuery{
			Scope:   archive,
			GroupID: id,
		})
		if err != nil {
			return nil, nil, "", err
		}
		// Rebuilt from whatever the archive still holds.
		return jobs, nil, id, nil

	case restoreScopeRelated:
		summaries, err := listAllArchivedSummaries(ctx, archive)
		if err != nil {
			return nil, nil, "", err
		}
		reachable := relatedJobIDsInArchive(summaries, id)
		if len(reachable) == 0 {
			return nil, nil, "", nil
		}
		jobs, err := loadArchivedJobsByIDs(ctx, archive, reachable)
		if err != nil {
			return nil, nil, "", err
		}
		return jobs, unresolvedLinks(summaries, reachable), "", nil
	}
	return nil, nil, "", nil
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
