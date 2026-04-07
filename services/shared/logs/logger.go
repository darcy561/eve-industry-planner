// Package logs provides the process-wide logger: JSON to stdout plus OpenTelemetry logs via otelzap.
//
// For structured key/value lines, use the *Ctx helpers so trace context is attached (otelzap + stdout):
//
//	logs.InfoCtx(ctx, "msg", "key", value)
//
// Or use [Zap] / [FromContext] with [Ctx]: logger.Info("msg", logs.Ctx(ctx), zap.String("k", "v")).
// The otelzap core reads [context.Context] from zap fields (see otelzap [Core.Write]).
//
// [TraceLogFields] adds trace_id and span_id strings for grep-friendly JSON on stdout (e.g. Loki); OTLP correlation still comes from [Ctx].
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

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func defaultResourceFields() []zap.Field {
	var fs []zap.Field
	if s := firstNonEmpty(
		os.Getenv("OTEL_SERVICE_NAME"),
		os.Getenv("LOG_SERVICE_NAME"),
		os.Getenv("SERVICE_NAME"),
	); s != "" {
		fs = append(fs, zap.String("service_name", s))
	}
	if env := firstNonEmpty(
		os.Getenv("DEPLOYMENT_ENVIRONMENT"),
		os.Getenv("ENVIRONMENT"),
	); env != "" {
		fs = append(fs, zap.String("deployment_environment", env))
	}
	if v := strings.TrimSpace(os.Getenv("LOG_SERVICE_VERSION")); v != "" {
		fs = append(fs, zap.String("service_version", v))
	}
	if hn, err := os.Hostname(); err == nil && hn != "" {
		fs = append(fs, zap.String("host_name", hn))
	}
	return fs
}

func parseZapLevel(v string) zapcore.LevelEnabler {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "debug":
		return zapcore.DebugLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func buildRoot() *zap.Logger {
	level := parseZapLevel(os.Getenv("LOG_LEVEL"))

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encCfg.EncodeDuration = zapcore.SecondsDurationEncoder
	enc := zapcore.NewJSONEncoder(encCfg)
	stdoutCore := zapcore.NewCore(enc, zapcore.AddSync(os.Stdout), level)

	otelCore := otelzap.NewCore(
		instrumentationName,
		otelzap.WithLoggerProvider(global.GetLoggerProvider()),
	)

	tee := zapcore.NewTee(stdoutCore, otelCore)
	return zap.New(tee,
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.Fields(defaultResourceFields()...),
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

// Ctx returns a zap field carrying context for otelzap (trace/span correlation on emit).
// Stdout JSON may include a minimal encoding of ctx; OTLP does not add ctx as a redundant log attribute.
func Ctx(ctx context.Context) zap.Field {
	if ctx == nil {
		return zap.Skip()
	}
	return zap.Any("ctx", ctx)
}

// TraceLogFields returns trace_id and span_id when the context carries a valid span (for stdout/Loki grep).
// Prefer [Ctx] for OTLP; use this when building a *zap.Logger or extra fields for human-readable JSON.
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

func withCtxFields(ctx context.Context, kv ...any) []zap.Field {
	fs := []zap.Field{Ctx(ctx)}
	fs = append(fs, TraceLogFields(ctx)...)
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
