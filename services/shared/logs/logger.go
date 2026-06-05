// Package logs provides the process-wide logger.
//
// In Compose/production, [EnableOTLPExport] (from telemetry.Init) sends all log levels over OTLP;
// Alloy drops below LOG_LEVEL before Loki and strips debug_steps unless LOG_LEVEL=debug.
// Service identity (compose_service, service.name) comes from telemetry resource attributes, not logger env vars.
// Set LOG_STDOUT=true to mirror JSON logs to container stdout for docker compose logs.
//
// For structured key/value lines, use the *Ctx helpers so trace context is attached:
//
//	logs.InfoCtx(ctx, "msg", "key", value)
//
// Or use [Zap] / [FromContext] with [Ctx]: logger.Info("msg", logs.Ctx(ctx), zap.String("k", "v")).
// [Ctx] carries [context.Context] for OTLP trace/span correlation on emit.
//
// [TraceLogFields] adds trace_id and span_id for LogQL filters on OTLP-ingested logs.
//
// HTTP handlers should receive a logger via [FromContext] (API middleware attaches a *zap.Logger to the request context).
// After telemetry.Init installs a LoggerProvider, ResetRoot is called so OTLP export picks up the provider.
package logs

import (
	"context"
	"os"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelzap"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

const instrumentationName = "eve-industry-planner/shared/logs"

var (
	rootMu sync.Mutex
	root   *zap.Logger
)

// ResetRoot clears the cached root logger so the next access rebuilds cores
// (e.g. after telemetry installs a global LoggerProvider).
func ResetRoot() {
	rootMu.Lock()
	defer rootMu.Unlock()
	root = nil
}

// Sync flushes any buffered log entries. Call on graceful shutdown after cancelling context.
func Sync() error {
	rootMu.Lock()
	z := root
	rootMu.Unlock()
	if z == nil {
		return nil
	}
	return z.Sync()
}

func logStdoutEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("LOG_STDOUT"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func buildRoot() *zap.Logger {
	// Export all levels over OTLP; Alloy filters by LOG_LEVEL and strips debug_steps before Loki (see observability/alloy/config.alloy).
	level := zapcore.DebugLevel

	if useOTLPExport() {
		otelCore := otelzap.NewCore(
			instrumentationName,
			otelzap.WithLoggerProvider(global.GetLoggerProvider()),
		)
		var core zapcore.Core = otelCore
		zapOpts := []zap.Option{zap.AddStacktrace(zapcore.ErrorLevel)}
		if logStdoutEnabled() {
			encCfg := zap.NewProductionEncoderConfig()
			encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
			encCfg.EncodeDuration = zapcore.SecondsDurationEncoder
			stdoutCore := zapcore.NewCore(zapcore.NewJSONEncoder(encCfg), zapcore.AddSync(os.Stdout), level)
			core = zapcore.NewTee(stdoutCore, otelCore)
			// Caller metadata is useful in docker compose logs; OTLP/Loki omit it (see observability/alloy scrub).
			zapOpts = append(zapOpts, zap.AddCaller())
		}
		return zap.New(core, zapOpts...)
	}

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encCfg.EncodeDuration = zapcore.SecondsDurationEncoder
	stdoutCore := zapcore.NewCore(zapcore.NewJSONEncoder(encCfg), zapcore.AddSync(os.Stdout), level)
	return zap.New(stdoutCore,
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel),
	)
}

func getRoot() *zap.Logger {
	rootMu.Lock()
	defer rootMu.Unlock()
	if root == nil {
		root = buildRoot()
	}
	return root
}

// Zap returns the production *zap.Logger (use zap.String, zap.Error, etc.).
func Zap() *zap.Logger {
	return getRoot()
}

// Ctx returns a zap field carrying context for OTLP trace/span correlation on emit (not encoded in JSON body).
func Ctx(ctx context.Context) zap.Field {
	if ctx == nil {
		return zap.Skip()
	}
	return zap.Any("ctx", ctx)
}

// TraceLogFields returns trace_id and span_id when the context carries a valid span (LogQL / structured metadata).
func TraceLogFields(ctx context.Context) []zap.Field {
	if ctx == nil {
		return nil
	}
	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsValid() {
		return nil
	}
	return []zap.Field{
		zap.String("trace_id", sc.TraceID().String()),
		zap.String("span_id", sc.SpanID().String()),
	}
}

// RequestStartTime returns the wall time stored at the API entry (before otelhttp, timeout, logging,
// compression, and route middleware). Use with [time.Since] for duration that includes that work.
// If absent, ok is false (e.g. tests without that middleware).
func RequestStartTime(ctx context.Context) (time.Time, bool) {
	if ctx == nil {
		return time.Time{}, false
	}
	t, ok := ctx.Value(RequestStartTimeKey{}).(time.Time)
	if !ok || t.IsZero() {
		return time.Time{}, false
	}
	return t, true
}

// FromContext returns the request-scoped logger if [LoggerKey] is set; otherwise the root
// logger with [TraceLogFields] when a span is present (no request-scoped fields otherwise).
func FromContext(ctx context.Context) *zap.Logger {
	if ctx == nil {
		return Zap()
	}
	if l, ok := ctx.Value(LoggerKey{}).(*zap.Logger); ok && l != nil {
		return l
	}
	if tf := TraceLogFields(ctx); len(tf) > 0 {
		return Zap().With(tf...)
	}
	return Zap()
}

// ContextWithLogger attaches a *zap.Logger for [FromContext] (e.g. tests or non-HTTP entrypoints).
func ContextWithLogger(ctx context.Context, l *zap.Logger) context.Context {
	if l == nil {
		return ctx
	}
	return context.WithValue(ctx, LoggerKey{}, l)
}

func fieldsFromKV(kv ...any) []zap.Field {
	var fs []zap.Field
	for i := 0; i < len(kv); i += 2 {
		if i+1 >= len(kv) {
			break
		}
		k, ok := kv[i].(string)
		if !ok {
			continue
		}
		fs = append(fs, zap.Any(k, kv[i+1]))
	}
	return fs
}

// AccessLogDetailFields returns top-level zap fields from handler success/failure detail maps.
// account_id and session_id are omitted when present; use [RequestIdentityFromRequest] on the access log envelope.
func AccessLogDetailFields(m map[string]interface{}) []zap.Field {
	if len(m) == 0 {
		return nil
	}
	fields := make([]zap.Field, 0, len(m))
	for k, v := range m {
		switch k {
		case "account_id", "session_id":
			continue
		}
		fields = append(fields, zap.Any(k, v))
	}
	return fields
}

func withCtxFields(ctx context.Context, kv ...any) []zap.Field {
	fs := []zap.Field{Ctx(ctx)}
	fs = append(fs, TraceLogFields(ctx)...)
	if !kvContainsKey(kv, "account_id") {
		if id := RequestAccountIDFromContext(ctx); id != "" {
			fs = append(fs, zap.String("account_id", id))
		}
	}
	if !kvContainsKey(kv, "session_id") {
		if id := RequestSessionIDFromContext(ctx); id != "" {
			fs = append(fs, zap.String("session_id", id))
		}
	}
	fs = append(fs, fieldsFromKV(kv...)...)
	return fs
}

// DebugCtx logs at debug with otel context and optional key/value pairs (keys must be strings).
func DebugCtx(ctx context.Context, msg string, kv ...any) {
	FromContext(ctx).Debug(msg, withCtxFields(ctx, kv...)...)
}

// InfoCtx logs at info with otel context and optional key/value pairs (keys must be strings).
func InfoCtx(ctx context.Context, msg string, kv ...any) {
	FromContext(ctx).Info(msg, withCtxFields(ctx, kv...)...)
}

// WarnCtx logs at warn with otel context and optional key/value pairs (keys must be strings).
func WarnCtx(ctx context.Context, msg string, kv ...any) {
	FromContext(ctx).Warn(msg, withCtxFields(ctx, kv...)...)
}

// ErrorCtx logs at error with otel context and optional key/value pairs (keys must be strings).
func ErrorCtx(ctx context.Context, msg string, kv ...any) {
	FromContext(ctx).Error(msg, withCtxFields(ctx, kv...)...)
}
