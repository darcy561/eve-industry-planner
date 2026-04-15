package middleware

import (
	"context"
	"fmt"
	"net/http"
	"runtime/debug"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/getsentry/sentry-go"
	"go.uber.org/zap"
)

// RequestLoggingConstructor attaches a request-scoped *zap.Logger (trace_id/span_id, method, path, ip)
// under LoggerKey and emits access logs. It expects r.Context() to already carry the server span (otelhttp)
// and optional deadline from RequestTimeoutConstructor and start time from RequestStartTimeConstructor.
// In the server chain it runs before CompressionConstructor, which adds content_encoding to the scoped logger for handlers.
func RequestLoggingConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			startTime := time.Now()
			if st, ok := ctx.Value(logs.RequestStartTimeKey{}).(time.Time); ok {
				startTime = st
			}

			reqFields := append(logs.TraceLogFields(ctx),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.String("ip", r.RemoteAddr),
			)
			reqLogger := logs.Zap().With(reqFields...)
			ctx = context.WithValue(ctx, logs.LoggerKey{}, reqLogger)
			r = r.WithContext(ctx)

			reqLogger.Debug("request started", logs.Ctx(ctx))

			rw := &responseWriter{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
			}

			next.ServeHTTP(rw, r)

			duration := time.Since(startTime)

			contentEncoding := rw.Header().Get("Content-Encoding")
			if contentEncoding == "" {
				contentEncoding = "identity"
			}

			doneLogger := reqLogger.With(
				zap.Int("status_code", rw.statusCode),
				zap.Int64("duration_ms", duration.Milliseconds()),
				zap.String("duration", duration.String()),
				zap.String("content_encoding", contentEncoding),
			)

			if rw.statusCode >= 500 {
				doneLogger.Error("request completed with server error", logs.Ctx(ctx))
				// Non-panic 5xx: request logging sees the status but sentryhttp only captures panics.
				sentry.WithScope(func(scope *sentry.Scope) {
					scope.SetRequest(r)
					scope.SetLevel(sentry.LevelError)
					scope.SetTag("status_code", fmt.Sprintf("%d", rw.statusCode))
					scope.SetContext("response", map[string]interface{}{
						"status_code":      rw.statusCode,
						"duration_ms":      duration.Milliseconds(),
						"duration":         duration.String(),
						"content_encoding": contentEncoding,
					})
					// Attach local call stack so non-panic 5xx events still provide source hints.
					scope.SetExtra("capture_stack", string(debug.Stack()))
					if herr := logs.HandlerErrorFromRequest(r); herr != nil {
						scope.SetTag("handler_error", "true")
						sentry.CaptureException(herr)
					} else {
						sentry.CaptureException(fmt.Errorf("HTTP %d %s %s", rw.statusCode, r.Method, r.URL.Path))
					}
				})
			} else if rw.statusCode >= 400 {
				doneLogger.Warn("request completed with client error", logs.Ctx(ctx))
			} else {
				doneLogger.Debug("request completed", logs.Ctx(ctx))
			}

			if duration > 1*time.Second {
				doneLogger.Warn("slow request detected", logs.Ctx(ctx))
			}
		})
	}
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
