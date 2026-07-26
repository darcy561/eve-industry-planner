package watchlist

import (
	"eve-industry-planner/shared/stackservices"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// Router handles /api/v1/user/watchlist requests.
func Router(w http.ResponseWriter, r *http.Request, clients *stackservices.Clients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		GetHandler(w, r, clients)
	case http.MethodPut:
		PutHandler(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		helper.RespondEndpointError(w, r, http.StatusMethodNotAllowed, "Method not allowed. Use GET or PUT.", "invalid method for watchlist endpoint", "watchlist_method_not_allowed", "watchlist", nil, map[string]interface{}{"method": r.Method})
	}
}
