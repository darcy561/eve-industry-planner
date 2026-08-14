package middleware

import (
	"encoding/json"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/logs"
)

// Paths that stay available while MAINTENANCE_MODE is on (load balancers, client banner).
var maintenanceBypassPaths = map[string]struct{}{
	"/health":            {},
	"/healthy":           {},
	"/ready":             {},
	"/api/v1/app-config": {},
}

// MaintenanceModeConstructor blocks API traffic when MAINTENANCE_MODE is enabled,
// except for paths in maintenanceBypassPaths.
func MaintenanceModeConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !helper.MaintenanceModeEnabled() {
				next.ServeHTTP(w, r)
				return
			}

			if _, ok := maintenanceBypassPaths[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}

			logs.InfoCtx(r.Context(), "request blocked during maintenance", "path", r.URL.Path, "method", r.Method)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":            "maintenance_mode",
				"maintenance_mode": true,
			})
		})
	}
}
