package logs

import (
	"context"
	"log/slog"
	"os"
	"strings"

	"eve-industry-planner/shared/shared/contextkeys"
)

// Logger returns a structured JSON logger configured via LOG_LEVEL env.
func Logger() *slog.Logger {
	level := parseLogLevel(os.Getenv("LOG_LEVEL"))
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(handler)
}

func parseLogLevel(v string) slog.Leveler {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "debug":
		lvl := slog.LevelDebug
		return &lvl
	case "warn", "warning":
		lvl := slog.LevelWarn
		return &lvl
	case "error":
		lvl := slog.LevelError
		return &lvl
	default:
		lvl := slog.LevelInfo
		return &lvl
	}
}

// Convenience helpers for functions to log without wiring a logger.

// Debug logs a debug message with optional key/value pairs.
func Debug(msg string, kv ...any) {
	Logger().Debug(msg, kv...)
}

// Info logs an info message with optional key/value pairs.
func Info(msg string, kv ...any) {
	Logger().Info(msg, kv...)
}

// Warn logs a warning message with optional key/value pairs.
func Warn(msg string, kv ...any) {
	Logger().Warn(msg, kv...)
}

// Error logs an error message with optional key/value pairs.
func Error(msg string, kv ...any) {
	Logger().Error(msg, kv...)
}

// Component returns a logger pre-tagged with a component field.
func Component(name string) *slog.Logger {
	return Logger().With(slog.String("component", name))
}

// getRequestIDFromContext extracts the request ID from context if present
func getRequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if requestID, ok := ctx.Value(contextkeys.RequestIDKey{}).(string); ok {
		return requestID
	}
	return ""
}

// loggerWithRequestID returns a logger with request ID if present in context
func loggerWithRequestID(ctx context.Context) *slog.Logger {
	logger := Logger()
	if requestID := getRequestIDFromContext(ctx); requestID != "" {
		logger = logger.With("request_id", requestID)
	}
	return logger
}

// Context-aware logging functions that automatically include request ID from context

// DebugCtx logs a debug message with request ID from context (if present) and optional key/value pairs.
func DebugCtx(ctx context.Context, msg string, kv ...any) {
	loggerWithRequestID(ctx).Debug(msg, kv...)
}

// InfoCtx logs an info message with request ID from context (if present) and optional key/value pairs.
func InfoCtx(ctx context.Context, msg string, kv ...any) {
	loggerWithRequestID(ctx).Info(msg, kv...)
}

// WarnCtx logs a warning message with request ID from context (if present) and optional key/value pairs.
func WarnCtx(ctx context.Context, msg string, kv ...any) {
	loggerWithRequestID(ctx).Warn(msg, kv...)
}

// ErrorCtx logs an error message with request ID from context (if present) and optional key/value pairs.
func ErrorCtx(ctx context.Context, msg string, kv ...any) {
	loggerWithRequestID(ctx).Error(msg, kv...)
}
