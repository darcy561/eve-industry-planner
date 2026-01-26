package v1endpoints

import (
	"net/http"

	"eve-industry-planner/api/api/v1endpoints/jobs"
	"eve-industry-planner/shared/shared"
)

// JobsRouter handles all job-related routes and routes to appropriate handlers
// This centralizes routing logic for all job endpoints
func JobsRouter(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path

	// Route based on path and method
	switch {
	case path == "/api/v1/jobs" || path == "/api/v1/jobs/":
		// Collection endpoint
		switch r.Method {
		case http.MethodGet:
			jobs.GetJobsHandler(w, r, clients)
		case http.MethodPost:
			jobs.PostJobsHandler(w, r, clients)
		case http.MethodPut:
			jobs.PutJobsHandler(w, r, clients)
		case http.MethodDelete:
			jobs.DeleteJobsHandler(w, r, clients)
		default:
			http.Error(w, "Method not allowed. Use GET /api/v1/jobs to retrieve all jobs, POST /api/v1/jobs to retrieve specific jobs by IDs, PUT /api/v1/jobs to save jobs, or DELETE /api/v1/jobs to delete jobs", http.StatusMethodNotAllowed)
		}
	default:
		// No longer support individual job endpoints
		http.Error(w, "Not found. Use PUT /api/v1/jobs to save jobs", http.StatusNotFound)
	}
}
