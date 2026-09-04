package statistics

import (
	"net/http"
	"strings"

	"eve-industry-planner/api/helper"
)

// Router routes /api/v1/statistics/* (private mux: rate limit + session auth).
//
// The owner leads the path as a handle — `account:{id}` — and filters stay in
// the query. Naming the owner rather than leaving it implicit is what lets a
// second kind be served without reshaping the account routes; whether the
// session may read the owner it named is the handler's question, because that
// compares the path against the session the auth middleware resolved.
func (h *Handlers) Router(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	const prefix = "/api/v1/statistics/"
	if !strings.HasPrefix(path, prefix) {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics route not found", "not_found", "statistics", nil, map[string]any{"path": path})
		return
	}
	handle, rest, found := strings.Cut(strings.TrimSuffix(strings.TrimPrefix(path, prefix), "/"), "/")
	if !found {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics route names no view", "not_found", "statistics", nil, map[string]any{"path": path})
		return
	}
	owner, err := parseOwnerHandle(handle)
	if err != nil {
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics owner handle unreadable", "not_found", "statistics", err, map[string]any{"path": path})
		return
	}
	r = withRequestOwner(r, owner)

	switch rest {
	case "timeline":
		h.GetTimelineHandler(w, r)
	case "timeline/items":
		h.GetTimelineItemsHandler(w, r)
	case "totals":
		h.GetTotalsHandler(w, r)
	default:
		helper.RespondEndpointError(w, r, http.StatusNotFound, "Not found", "statistics view not found", "not_found", "statistics", nil, map[string]any{"path": path, "view": rest})
	}
}
