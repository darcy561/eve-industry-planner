package helper

import (
	"context"
	"time"
)

// RequestMetricsHooks defines callbacks used to record standard endpoint request metrics.
type RequestMetricsHooks struct {
	ObserveDuration func(context.Context, float64)
	IncRequests     func(context.Context)
	IncSuccesses    func(context.Context)
	IncErrors       func(context.Context, string)
}

// RequestMetricsTracker records common request metrics with one deferred finish call.
type RequestMetricsTracker struct {
	ctx   context.Context
	start time.Time
	hooks RequestMetricsHooks
}

// BeginRequestMetrics creates a new tracker using middleware start time fallback.
func BeginRequestMetrics(ctx context.Context, hooks RequestMetricsHooks) *RequestMetricsTracker {
	return &RequestMetricsTracker{
		ctx:   ctx,
		start: RequestStartOrNow(ctx),
		hooks: hooks,
	}
}

// Finish records request duration and increments request count.
func (t *RequestMetricsTracker) Finish() {
	if t == nil {
		return
	}
	if t.hooks.ObserveDuration != nil {
		t.hooks.ObserveDuration(t.ctx, time.Since(t.start).Seconds()*1000.0)
	}
	if t.hooks.IncRequests != nil {
		t.hooks.IncRequests(t.ctx)
	}
}

// Success increments success count.
func (t *RequestMetricsTracker) Success() {
	if t == nil || t.hooks.IncSuccesses == nil {
		return
	}
	t.hooks.IncSuccesses(t.ctx)
}

// Error increments error count for the provided reason label.
func (t *RequestMetricsTracker) Error(reason string) {
	if t == nil || t.hooks.IncErrors == nil {
		return
	}
	t.hooks.IncErrors(t.ctx, reason)
}
