package statistics

import (
	"net/http"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + JWT).
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/api/v1/statistics/build-stats" || path == "/api/v1/statistics/build-stats/":
		h.GetBuildStatsHandler(w, r)
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics route not found", "not_found", "statistics", nil, nil)
	}
}
