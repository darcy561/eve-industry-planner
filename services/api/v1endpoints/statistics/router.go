package statistics

import (
	"net/http"

	"eve-industry-planner/shared/shared"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + JWT).
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/statistics/build-stats" || path == "/api/v1/statistics/build-stats/":
		GetBuildStatsHandler(w, r, clients)
	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}
