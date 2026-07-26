package archivedjobs

import (
	"eve-industry-planner/shared/stackservices"
	"net/http"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/archived-jobs (batch upsert archived job payloads to Mongo).
// Runs after api private middleware (rate limit, auth); see PutArchivedJobsHandler for status codes.
func Router(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/archived-jobs" || path == "/api/v1/archived-jobs/":
		switch r.Method {
		case http.MethodPut:
			PutArchivedJobsHandler(w, r, clients)
		default:
			helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use PUT /api/v1/archived-jobs with body {\"jobs\":[models.Job JSON...]}", "invalid method for archived jobs endpoint", "method_not_allowed", "archived_jobs", nil, map[string]interface{}{"method": r.Method})
		}
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "archived jobs route not found", "not_found", "archived_jobs", nil, nil)
	}
}
