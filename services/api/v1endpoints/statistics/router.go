package statistics

import (
	"eve-industry-planner/shared/stackservices"
	"net/http"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + JWT).
func Router(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/statistics/build-stats" || path == "/api/v1/statistics/build-stats/":
		GetBuildStatsHandler(w, r, clients)
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics route not found", "not_found", "statistics", nil, nil)
	}
}
