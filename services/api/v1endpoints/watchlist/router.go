package watchlist

import (
	"net/http"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

// Router handles /api/v1/user/watchlist requests.
func Router(w http.ResponseWriter, r *http.Request, clients *shared.ServiceClients) {
	ctx := r.Context()
	switch r.Method {
	case http.MethodGet:
		GetHandler(w, r, clients)
	case http.MethodPut:
		PutHandler(w, r, clients)
	default:
		m := apimetrics.GetAPIEveTokenLogin()
		m.Errors.WithLabelValues("method_not_allowed").Inc(ctx)
		logs.WarnCtx(ctx, "invalid method for watchlist endpoint")
		http.Error(w, "Method not allowed. Use GET or PUT.", http.StatusMethodNotAllowed)
	}
}
