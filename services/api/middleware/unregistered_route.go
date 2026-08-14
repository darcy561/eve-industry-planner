package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"eve-industry-planner/shared/logs"
)

// UnregisteredRoutesMuxConstructor must be the last entry in [Chain]: it serves the mux and
// does not delegate to the inner handler passed to Chain.
func UnregisteredRoutesMuxConstructor(mux *http.ServeMux) MiddlewareConstructor {
	return func(_ http.Handler) http.Handler {
		return WrapServeMuxUnregisteredRoutes(mux)
	}
}

// WrapServeMuxUnregisteredRoutes wraps a ServeMux so requests with no registered route
// return a generic 404 to clients while logging method and path for operators.
func WrapServeMuxUnregisteredRoutes(mux *http.ServeMux) http.Handler {
	if mux == nil {
		mux = http.NewServeMux()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pattern := mux.Handler(r)
		if pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		respondUnregisteredRoute(w, r)
	})
}

func respondUnregisteredRoute(w http.ResponseWriter, r *http.Request) {
	method := strings.TrimSpace(r.Method)
	if method == "" {
		method = http.MethodGet
	}
	path := r.URL.Path

	logMsg := fmt.Sprintf("no API route registered for %s %s", method, path)
	logs.AttachClientFailureDetail(r, logMsg, map[string]any{
		"failure_class": "api_route_not_found",
		"method":        method,
		"path":          path,
	})
	http.NotFound(w, r)
}
