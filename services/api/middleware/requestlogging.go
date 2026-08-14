package middleware

import (
	"bufio"
	"context"
	"errors"
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
			ctx = logs.WithRequestID(ctx, rid)
			reqFields := append(logs.TraceLogFields(ctx),
				zap.String("request_id", rid),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.String("ip", r.RemoteAddr),
			)
			reqLogger := logs.Zap().With(reqFields...)
			ctx = logs.WithHandlerFailureDetailStore(ctx)
			ctx = context.WithValue(ctx, logs.LoggerKey{}, reqLogger)
			r = r.WithContext(ctx)

			logs.AttachDebugStep(r, "request_started", nil)

			rw := &responseWriter{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
			}

			next.ServeHTTP(rw, r)

			// Traefik/Swarm poll status paths; skip access logs (no operator value).
			if r.URL.Path == "/health" || r.URL.Path == "/healthy" || r.URL.Path == "/ready" {
				return
			}

			duration := time.Since(startTime)

			contentEncoding := rw.Header().Get("Content-Encoding")
			if contentEncoding == "" {
				contentEncoding = "identity"
			}

			doneFields := []zap.Field{
				zap.Int("status_code", rw.statusCode),
				zap.Int64("duration_ms", duration.Milliseconds()),
				zap.String("content_encoding", contentEncoding),
			}
			if accountID, sessionID := logs.RequestIdentityFromRequest(r); accountID != "" || sessionID != "" {
				if accountID != "" {
					doneFields = append(doneFields, zap.String("account_id", accountID))
				}
				if sessionID != "" {
					doneFields = append(doneFields, zap.String("session_id", sessionID))
				}
			}
			doneLogger := reqLogger.With(doneFields...)

			appendDebugSteps := func(fields []zap.Field) []zap.Field {
				if steps := logs.DebugStepsFromRequest(r); len(steps) > 0 {
					return append(fields, zap.Any(logs.DebugStepsLogKey, logs.DebugStepsForLog(steps)))
				}
				return fields
			}

			if rw.statusCode >= 500 && rw.statusCode != http.StatusServiceUnavailable {
				det := logs.HandlerFailureDetailFromRequest(r)
				errFields := appendDebugSteps([]zap.Field{logs.Ctx(ctx)})
				if herr := logs.HandlerErrorFromRequest(r); herr != nil {
					errFields = append(errFields, zap.Error(herr))
				}
				if len(det) > 0 {
					errFields = append(errFields, logs.AccessLogDetailFields(det)...)
				}
				doneLogger.Error(logs.AccessLogMessage(rw.statusCode, det), errFields...)
				// Client disconnect / request deadline on a handler that still returned 5xx is not a server fault.
				if herr := logs.HandlerErrorFromRequest(r); herr != nil &&
					(errors.Is(herr, context.Canceled) || errors.Is(herr, context.DeadlineExceeded)) {
					return
				}
				// Non-panic 5xx: request logging sees the status but sentryhttp only captures panics.
				sentry.WithScope(func(scope *sentry.Scope) {
					scope.SetRequest(r)
					scope.SetLevel(sentry.LevelError)
					scope.SetTag("status_code", fmt.Sprintf("%d", rw.statusCode))
					scope.SetContext("response", map[string]any{
						"status_code":      rw.statusCode,
						"duration_ms":      duration.Milliseconds(),
						"content_encoding": contentEncoding,
					})
					if len(det) > 0 {
						scope.SetContext("handler_failure", det)
					}
					// Attach local call stack so non-panic 5xx events still provide source hints.
					scope.SetContext("debug", map[string]any{
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
				det := logs.HandlerFailureDetailFromRequest(r)
				clientFields := appendDebugSteps([]zap.Field{logs.Ctx(ctx)})
				if len(det) > 0 {
					clientFields = append(clientFields, logs.AccessLogDetailFields(det)...)
				}
				doneLogger.Warn(logs.AccessLogMessage(rw.statusCode, det), clientFields...)
			} else {
				successMsg, successDet, caveats := logs.HandlerSuccessFromRequest(r)
				if len(caveats) > 0 {
					fields := appendDebugSteps([]zap.Field{logs.Ctx(ctx), zap.Any("caveats", logs.HandlerCaveatsForLog(caveats))})
					if len(successDet) > 0 {
						fields = append(fields, logs.AccessLogDetailFields(successDet)...)
					}
					doneLogger.Warn(logs.SuccessAccessLogMessage(successMsg, caveats), fields...)
				} else if successMsg != "" || len(successDet) > 0 {
					fields := appendDebugSteps([]zap.Field{logs.Ctx(ctx)})
					if len(successDet) > 0 {
						fields = append(fields, logs.AccessLogDetailFields(successDet)...)
					}
					doneLogger.Info(logs.SuccessAccessLogMessage(successMsg, caveats), fields...)
				}
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
