package logs

import (
	"context"
	"maps"
	"net/http"
	"strings"
	"time"

	"go.uber.org/zap"
)

// DebugStepsLogKey is the structured field name on consolidated access logs.
const DebugStepsLogKey = "debug_steps"

// MaxDebugSteps caps how many steps are retained per operation (HTTP request, job, etc.).
const MaxDebugSteps = 50

// DebugStepsField returns the debug_steps field for an access log line, and [zap.Skip] unless
// LOG_LEVEL is debug. Steps are collected regardless so that raising the level needs no code path
// of its own; only the emitted line changes.
func DebugStepsField(steps []DebugStep) zap.Field {
	if len(steps) == 0 || !debugLevelEnabled() {
		return zap.Skip()
	}
	return zap.Any(DebugStepsLogKey, DebugStepsForLog(steps))
}

// DebugStep is one diagnostic step collected during an operation for deferred logging on the outcome line.
type DebugStep struct {
	Step  string
	Msg   string
	Extra map[string]any
	AtMS  int64
}

// AttachDebugStep records a diagnostic step on the request-scoped log store for the consolidated access log.
// Prefer this over [DebugCtx] for in-request detail that should appear in debug_steps on the outcome line.
func AttachDebugStep(r *http.Request, step string, extra map[string]any) {
	if r == nil {
		return
	}
	attachDebugStep(r.Context(), step, "", extra)
}

// AttachDebugStepCtx is [AttachDebugStep] for callers that only have context (workers, tasks).
func AttachDebugStepCtx(ctx context.Context, step string, extra map[string]any) {
	attachDebugStep(ctx, step, "", extra)
}

// AttachDebugStepMsg records a step with an optional human-readable message.
func AttachDebugStepMsg(r *http.Request, step, msg string, extra map[string]any) {
	if r == nil {
		return
	}
	attachDebugStep(r.Context(), step, msg, extra)
}

// AttachDebugStepOrDebugCtx records a debug step when a request log store is present (HTTP);
// otherwise emits a Debug line (workers, NATS callbacks, etc.).
func AttachDebugStepOrDebugCtx(ctx context.Context, step, msg string, extra map[string]any) {
	if failureDetailStoreFromContext(ctx) != nil {
		attachDebugStep(ctx, step, msg, extra)
		return
	}
	if msg == "" {
		msg = step
	}
	kv := make([]any, 0, len(extra)*2)
	for k, v := range extra {
		kv = append(kv, k, v)
	}
	DebugCtx(ctx, msg, kv...)
}

func attachDebugStep(ctx context.Context, step, msg string, extra map[string]any) {
	store := failureDetailStoreFromContext(ctx)
	if store == nil {
		return
	}
	if len(store.debugSteps) >= MaxDebugSteps {
		return
	}
	s := DebugStep{
		Step: strings.TrimSpace(step),
		Msg:  strings.TrimSpace(msg),
		AtMS: elapsedMSSinceRequestStart(ctx),
	}
	if len(extra) > 0 {
		s.Extra = make(map[string]any, len(extra))
		maps.Copy(s.Extra, extra)
		enrichFailureDetailRequestIdentity(ctx, s.Extra)
	}
	store.debugSteps = append(store.debugSteps, s)
}

func elapsedMSSinceRequestStart(ctx context.Context) int64 {
	start, ok := RequestStartTime(ctx)
	if !ok {
		return 0
	}
	return time.Since(start).Milliseconds()
}

// DebugStepsFromRequest returns debug steps attached during the operation, if any.
func DebugStepsFromRequest(r *http.Request) []DebugStep {
	if r == nil {
		return nil
	}
	return DebugStepsFromContext(r.Context())
}

// DebugStepsFromContext returns debug steps from ctx when a log store is present.
func DebugStepsFromContext(ctx context.Context) []DebugStep {
	store := failureDetailStoreFromContext(ctx)
	if store == nil || len(store.debugSteps) == 0 {
		return nil
	}
	return append([]DebugStep(nil), store.debugSteps...)
}

// DebugStepsForLog formats debug steps for structured access logging.
func DebugStepsForLog(steps []DebugStep) []map[string]any {
	if len(steps) == 0 {
		return nil
	}
	out := make([]map[string]any, len(steps))
	for i, s := range steps {
		m := map[string]any{
			"step":  s.Step,
			"at_ms": s.AtMS,
		}
		if s.Msg != "" {
			m["msg"] = s.Msg
		}
		maps.Copy(m, s.Extra)
		out[i] = m
	}
	return out
}
