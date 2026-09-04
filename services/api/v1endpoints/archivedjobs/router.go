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

		case len(segments) == 2 && segments[1] == "filing" && segments[0] != "":
			if !requireFilingMethod(w, r) {
				return
			}
			h.FileArchivedJobMonthsHandler(w, r, selectionJob, segments[0])

		case len(segments) == 2 && segments[1] == "restore" && segments[0] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, selectionJob, segments[0])

		case len(segments) == 3 && segments[0] == "groups" && segments[2] == "filing" && segments[1] != "":
			if !requireFilingMethod(w, r) {
				return
			}
			h.FileArchivedJobMonthsHandler(w, r, selectionGroup, segments[1])

		case len(segments) == 3 && segments[0] == "related" && segments[2] == "filing" && segments[1] != "":
			if !requireFilingMethod(w, r) {
				return
			}
			h.FileArchivedJobMonthsHandler(w, r, selectionRelated, segments[1])

		case len(segments) == 3 && segments[0] == "groups" && segments[2] == "restore" && segments[1] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, selectionGroup, segments[1])

		case len(segments) == 3 && segments[0] == "related" && segments[2] == "restore" && segments[1] != "":
			if !requireRestoreMethod(w, r) {
				return
			}
			h.RestoreArchivedJobsHandler(w, r, selectionRelated, segments[1])

		default:
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "archived jobs route not found", "not_found", "archived_jobs", nil, map[string]any{"path": path})
			return
		}
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "archived jobs route not found", "not_found", "archived_jobs", nil, nil)
	}
}

// requireFilingMethod holds the filing routes to PATCH: they change part of a
// document that is already there.
func requireFilingMethod(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodPatch {
		return true
	}
	helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use PATCH to file months", "invalid method for archived jobs filing", "method_not_allowed", "archived_jobs", nil, map[string]any{"method": r.Method})
	return false
}

// requireRestoreMethod holds the restore routes to POST.
func requireRestoreMethod(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodPost {
		return true
	}
	helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use POST to restore", "invalid method for archived jobs restore", "method_not_allowed", "archived_jobs", nil, map[string]any{"method": r.Method})
	return false
}
