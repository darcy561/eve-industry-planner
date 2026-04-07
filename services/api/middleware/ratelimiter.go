package middleware

import (
	"net/http"

	"eve-industry-planner/shared/logs"

	"github.com/ulule/limiter/v3"
	lstdlib "github.com/ulule/limiter/v3/drivers/middleware/stdlib"
)

// RateLimiterConstructor wraps the ulule limiter stdlib middleware. Logging uses the request-scoped
// logger (method, path, ip, content_encoding, trace) from upstream middleware; these lines add
// rate-limit outcome only. scope labels the limiter (e.g. "public" vs "private") for Grafana.
func RateLimiterConstructor(store limiter.Store, rateLimit limiter.Rate, scope string) MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		l := limiter.New(store, rateLimit, limiter.WithTrustForwardHeader(true))
		mw := lstdlib.NewMiddleware(l)
		inner := mw.Handler(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			sr := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			inner.ServeHTTP(sr, r)

			remaining := sr.Header().Get("X-RateLimit-Remaining")
			if sr.status == http.StatusTooManyRequests {
				logs.WarnCtx(ctx, "request rate limited", "rate_limit_scope", scope, "rate_limit_remaining", remaining)
				return
			}
			logs.DebugCtx(ctx, "request within rate limit", "rate_limit_scope", scope, "rate_limit_remaining", remaining)
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
