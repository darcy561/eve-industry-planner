package middleware

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/getsentry/sentry-go"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// RequestLoggingConstructor attaches a request-scoped *zap.Logger (trace_id/span_id, request_id, method, path, ip)
// under LoggerKey and emits access logs. request_id is taken from X-Request-ID when present, otherwise a new UUID.
// It expects start time from RequestStartTimeConstructor. Optional trace/span fields appear when the
// context already carries an OpenTelemetry span (e.g. otelhttp on the API); the websocket service does not
// wrap /ws with otelhttp because WebSocket upgrades require http.Hijacker on the ResponseWriter.
// In the server chain it runs before CompressionConstructor, which adds content_encoding to the scoped logger for handlers.
func RequestLoggingConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			startTime := time.Now()
			if st, ok := ctx.Value(logs.RequestStartTimeKey{}).(time.Time); ok {
				startTime = st
			}

			rid := strings.TrimSpace(r.Header.Get("X-Request-ID"))
			if rid == "" {
				rid = uuid.NewString()
			}
			reqFields := append(logs.TraceLogFields(ctx),
				zap.String("request_id", rid),
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
				errFields := []zap.Field{logs.Ctx(ctx)}
				if herr := logs.HandlerErrorFromRequest(r); herr != nil {
					errFields = append(errFields, zap.Error(herr))
				}
				if det := logs.HandlerFailureDetailFromRequest(r); len(det) > 0 {
					errFields = append(errFields, zap.Any("handler_failure", det))
				}
				doneLogger.Error("request completed with server error", errFields...)
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
					if det := logs.HandlerFailureDetailFromRequest(r); len(det) > 0 {
						scope.SetContext("handler_failure", det)
					}
					// Attach local call stack so non-panic 5xx events still provide source hints.
					scope.SetContext("debug", map[string]interface{}{
						"capture_stack": string(debug.Stack()),
					})
					if herr := logs.HandlerErrorFromRequest(r); herr != nil {
						scope.SetTag("handler_error", "true")
						scope.SetTag("handler_error_attached", "true")
						sentry.CaptureException(herr)
					} else {
						scope.SetTag("handler_error", "false")
						scope.SetTag("handler_error_attached", "false")
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

// Hijack delegates to the underlying ResponseWriter so handlers like WebSocket upgrades work.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("response writer does not implement http.Hijacker")
}

// Flush delegates when the underlying writer supports it (streaming / compression).
func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
