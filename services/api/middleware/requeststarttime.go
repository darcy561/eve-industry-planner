package middleware

import (
	"context"
	"net/http"
	"time"

	"eve-industry-planner/shared/logs"
)

// RequestStartTimeConstructor records wall time on the request context as early as possible.
// Compose it outside [go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp] so
// handler duration metrics include otelhttp work; inner middleware (e.g. [RequestTimeoutConstructor])
// must not overwrite [logs.RequestStartTimeKey].
func RequestStartTimeConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ctx := context.WithValue(r.Context(), logs.RequestStartTimeKey{}, start)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
