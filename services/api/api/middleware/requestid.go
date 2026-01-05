package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"eve-industry-planner/shared/shared/contextkeys"
	"eve-industry-planner/shared/shared/logs"

	"github.com/google/uuid"
)

// RequestIDConstructor creates middleware that generates and tracks request IDs
// It extracts X-Request-ID or X-Trace-ID from headers, or generates a new UUID
// The request ID is stored in context and added to all logs and response headers
// Also creates a timeout context (10 seconds) and stores start time for duration tracking
func RequestIDConstructor() MiddlewareConstructor {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			startTime := time.Now()

			// Extract or generate request ID
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = r.Header.Get("X-Trace-ID")
			}
			if requestID == "" {
				requestID = uuid.New().String()
			}

			// Create timeout context (10 seconds default) with request ID and start time
			timeoutCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
			defer cancel()

			// Store request ID and start time in the timeout context
			ctx := context.WithValue(timeoutCtx, contextkeys.RequestIDKey{}, requestID)
			ctx = context.WithValue(ctx, contextkeys.RequestStartTimeKey{}, startTime)
			r = r.WithContext(ctx)

			// Create logger with request ID
			logger := logs.Logger().With(
				"request_id", requestID,
				"method", r.Method,
				"path", r.URL.Path,
				"ip", r.RemoteAddr,
			)

			// Log request start
			logger.Debug("request started")

			// Wrap response writer to capture status code
			rw := &responseWriter{
				ResponseWriter: w,
				statusCode:     http.StatusOK,
			}

			// Process request
			next.ServeHTTP(rw, r)

			// Calculate duration
			duration := time.Since(startTime)

			// Log request completion
			logger = logger.With(
				"status_code", rw.statusCode,
				"duration_ms", duration.Milliseconds(),
				"duration", duration.String(),
			)

			if rw.statusCode >= 500 {
				logger.Error("request completed with server error")
			} else if rw.statusCode >= 400 {
				logger.Warn("request completed with client error")
			} else {
				logger.Debug("request completed")
			}

			// Log slow requests
			if duration > 1*time.Second {
				logger.Warn("slow request detected")
			}
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// GetRequestID extracts the request ID from the context
// Returns empty string if not found
func GetRequestID(ctx context.Context) string {
	if requestID, ok := ctx.Value(contextkeys.RequestIDKey{}).(string); ok {
		return requestID
	}
	return ""
}

// WithRequestID returns a logger with the request ID from context
// This allows handlers to log with the request ID automatically
func WithRequestID(ctx context.Context) *slog.Logger {
	requestID := GetRequestID(ctx)
	if requestID == "" {
		return logs.Logger()
	}
	return logs.Logger().With("request_id", requestID)
}
