package middleware

import (
	"context"
	"net/http"

	"eve-industry-planner/api/helper"
	"eve-industry-planner/shared/httpmiddleware"
	"eve-industry-planner/shared/logs"
)

// Paths that stay available while maintenance is on: probes, and the SPA's app-config read.
var maintenanceBypassPaths = map[string]struct{}{
	"/health":            {},
	"/healthy":           {},
	"/ready":             {},
	"/api/v1/app-config": {},
}

// MaintenanceFlag reports whether maintenance is on.
type MaintenanceFlag interface {
	Enabled(ctx context.Context) bool
}

// MaintenanceModeConstructor blocks API traffic while maintenance is on, except
// for paths in maintenanceBypassPaths. A nil flag blocks nothing.
func MaintenanceModeConstructor(flag MaintenanceFlag) httpmiddleware.MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if flag == nil || !flag.Enabled(r.Context()) {
				next.ServeHTTP(w, r)
				return
			}

			if _, ok := maintenanceBypassPaths[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}

			logs.InfoCtx(r.Context(), "request blocked during maintenance", "path", r.URL.Path, "method", r.Method)

			_ = helper.EncodeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{
				"error":            "maintenance_mode",
				"maintenance_mode": true,
			})
		})
	}
}
