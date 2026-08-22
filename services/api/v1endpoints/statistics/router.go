package statistics

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + session auth).
//
// Scope leads the path and filters stay in the query. The account scope carries
// no identifier because the account is resolved from the session, never read
// from the request; a corporation scope will name its ref in the path, because a
// caller may belong to several and the value it names decides what it may see.
// Putting that in a query parameter would place the authorization boundary
// alongside ordinary filters like typeID.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	switch {
	case path == "/api/v1/statistics/build-stats" || path == "/api/v1/statistics/build-stats/":
		h.GetBuildStatsHandler(w, r)

	default:
		const prefix = "/api/v1/statistics/account/"
		if !strings.HasPrefix(path, prefix) {
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics route not found", "not_found", "statistics", nil, map[string]any{"path": path})
			return
		}
		rest := strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/")

		switch rest {
		case "timeline":
			h.GetTimelineHandler(w, r)
		case "timeline/items":
			h.GetTimelineItemsHandler(w, r)
		case "totals":
			h.GetTotalsHandler(w, r)
		default:
			helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics account route not found", "not_found", "statistics", nil, map[string]any{"path": path, "view": rest})
		}
	}
}
