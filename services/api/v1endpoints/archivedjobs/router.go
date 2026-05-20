package archivedjobs

import (
	"net/http"

	"eve-industry-planner/shared"
)

// Router routes /api/v1/archived-jobs (batch upsert archived job payloads to Mongo).
// Runs after api private middleware (rate limit, auth); see PutArchivedJobsHandler for status codes.
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/archived-jobs" || path == "/api/v1/archived-jobs/":
		switch r.Method {
		case http.MethodGet:
			GetArchivedJobsHandler(w, r, clients)
		case http.MethodPut:
			PutArchivedJobsHandler(w, r, clients)
		default:
			http.Error(w, "Method not allowed. Use GET /api/v1/archived-jobs or PUT /api/v1/archived-jobs", http.StatusMethodNotAllowed)
		}
	case path == "/api/v1/archived-jobs/restore" || path == "/api/v1/archived-jobs/restore/":
		switch r.Method {
		case http.MethodPost:
			PostRestoreArchivedJobHandler(w, r, clients)
		default:
			http.Error(w, "Method not allowed. Use POST /api/v1/archived-jobs/restore?jobID=<job-id>", http.StatusMethodNotAllowed)
		}
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}
