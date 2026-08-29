package archivedjobs

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/archived-jobs (upsert, reads, and restore). Runs after
// api private middleware (rate limit, auth); see each handler for status codes.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/archived-jobs" || path == "/api/v1/archived-jobs/":
		switch r.Method {
		case http.MethodPut:
			h.PutArchivedJobsHandler(w, r)
		case http.MethodGet:
			h.GetArchivedJobsHandler(w, r)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use PUT /api/v1/archived-jobs with body {\"jobs\":[models.Job JSON...]}, or GET to list", "invalid method for archived jobs endpoint", "method_not_allowed", "archived_jobs", nil, map[string]any{"method": r.Method})
			return
		}
	case strings.HasPrefix(path, "/api/v1/archived-jobs/"):
		rest := strings.TrimSuffix(strings.TrimPrefix(path, "/api/v1/archived-jobs/"), "/")
		segments := strings.Split(rest, "/")

		switch {
		case len(segments) == 1 && segments[0] != "":
			if r.Method != http.MethodGet {
				helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET /api/v1/archived-jobs/{jobID}", "invalid method for archived job endpoint", "method_not_allowed", "archived_jobs", nil, map[string]any{"method": r.Method})
				return
			}
			h.GetArchivedJobHandler(w, r, segments[0])

		case len(segments) == 2 && segments[1] == "restore" && segments[0] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, restoreScopeJob, segments[0])

		case len(segments) == 3 && segments[0] == "groups" && segments[2] == "restore" && segments[1] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, restoreScopeGroup, segments[1])

		case len(segments) == 3 && segments[0] == "related" && segments[2] == "restore" && segments[1] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, restoreScopeRelated, segments[1])

		default:
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "archived jobs route not found", "not_found", "archived_jobs", nil, map[string]any{"path": path})
			return
		}
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "archived jobs route not found", "not_found", "archived_jobs", nil, nil)
	}
}

// requireRestoreMethod holds the restore routes to POST.
func requireRestoreMethod(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodPost {
		return true
	}
	helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use POST to restore", "invalid method for archived jobs restore", "method_not_allowed", "archived_jobs", nil, map[string]any{"method": r.Method})
	return false
}
