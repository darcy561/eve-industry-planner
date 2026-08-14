package logs

import (
	"context"
	"maps"
	"strings"
	"time"

	"go.uber.org/zap"
)

// BeginOperationContext prepares ctx for consolidated operation logging: a mutable debug-step
// store and operation start time (for debug_steps.at_ms). Use with [AttachDebugStepCtx] and
// [DebugStepsFromContext]; end the operation with a single outcome log line.
// When parent already has a store or start time, those are reused (HTTP request scope).
func BeginOperationContext(parent context.Context) context.Context {
	if parent == nil {
		parent = context.Background()
	}
	ctx := WithHandlerFailureDetailStore(parent)
	if _, ok := RequestStartTime(ctx); ok {
		return ctx
	}
	return context.WithValue(ctx, RequestStartTimeKey{}, time.Now())
}

// BeginIsolatedOperationContext starts a nested operation with a fresh debug-step store and
// start time while preserving identity, logger, and trace fields from parent.
// Use for WebSocket per-message handling so polling does not accumulate upgrade debug_steps.
func BeginIsolatedOperationContext(parent context.Context) context.Context {
	if parent == nil {
		parent = context.Background()
	}
	ctx := WithFreshHandlerFailureDetailStore(parent)
	return context.WithValue(ctx, RequestStartTimeKey{}, time.Now())
}

// AttachHandlerCaveatCtx records a non-fatal issue on an operation context (WebSocket messages, workers).
func AttachHandlerCaveatCtx(ctx context.Context, key, msg string, extra map[string]any) {
	store := failureDetailStoreFromContext(ctx)
	if store == nil {
		return
	}
	c := HandlerCaveat{
		Key: strings.TrimSpace(key),
		Msg: strings.TrimSpace(msg),
	}
	if len(extra) > 0 {
		c.Extra = make(map[string]any, len(extra))
		maps.Copy(c.Extra, extra)
		enrichFailureDetailRequestIdentity(ctx, c.Extra)
	}
	store.caveats = append(store.caveats, c)
}

// HandlerCaveatsFromContext returns caveats recorded on the operation context.
func HandlerCaveatsFromContext(ctx context.Context) []HandlerCaveat {
	store := failureDetailStoreFromContext(ctx)
	if store == nil || len(store.caveats) == 0 {
		return nil
	}
	return append([]HandlerCaveat(nil), store.caveats...)
}

// EmitAccessShapedLog writes one structured line in the same field shape as HTTP access logs
// (identity, flattened detail, debug_steps, caveats). Use for high-volume success paths that
// should not emit middleware Info lines (e.g. lock-state-batch polling).
func EmitAccessShapedLog(ctx context.Context, level, msg string, detail map[string]any, steps []DebugStep, caveats []HandlerCaveat) {
	fields := accessShapedLogFields(ctx, detail, steps, caveats)
	logger := FromContext(ctx)
	switch level {
	case "warn":
		logger.Warn(msg, fields...)
	case "error":
		logger.Error(msg, fields...)
	case "debug":
		logger.Debug(msg, fields...)
	default:
		logger.Info(msg, fields...)
	}
}

// EnsureOperationLogger attaches a scoped logger when ctx carries trace or request identity but no LoggerKey.
func EnsureOperationLogger(ctx context.Context) context.Context {
	if ctx == nil {
		return ctx
	}
	if l, ok := ctx.Value(LoggerKey{}).(*zap.Logger); ok && l != nil {
		return ctx
	}
	var fields []zap.Field
	fields = append(fields, TraceLogFields(ctx)...)
	if rid := RequestIDFromContext(ctx); rid != "" {
		fields = append(fields, zap.String("request_id", rid))
	}
	if accountID := RequestAccountIDFromContext(ctx); accountID != "" {
		fields = append(fields, zap.String("account_id", accountID))
	}
	if sessionID := RequestSessionIDFromContext(ctx); sessionID != "" {
		fields = append(fields, zap.String("session_id", sessionID))
	}
	if len(fields) == 0 {
		return ctx
	}
	return ContextWithLogger(ctx, Zap().With(fields...))
}

func accessShapedLogFields(ctx context.Context, detail map[string]any, steps []DebugStep, caveats []HandlerCaveat) []zap.Field {
	fields := []zap.Field{Ctx(ctx)}
	if rid := RequestIDFromContext(ctx); rid != "" {
		fields = append(fields, zap.String("request_id", rid))
	}
	if accountID := RequestAccountIDFromContext(ctx); accountID != "" {
		fields = append(fields, zap.String("account_id", accountID))
	}
	if sessionID := RequestSessionIDFromContext(ctx); sessionID != "" {
		fields = append(fields, zap.String("session_id", sessionID))
	}
	fields = append(fields, AccessLogDetailFields(detail)...)
	if len(steps) > 0 {
		fields = append(fields, zap.Any(DebugStepsLogKey, DebugStepsForLog(steps)))
	}
	if len(caveats) > 0 {
		fields = append(fields, zap.Any("caveats", HandlerCaveatsForLog(caveats)))
	}
	return fields
}
