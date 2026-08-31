// Package natsprop propagates OpenTelemetry trace context and request identity through NATS headers and string maps (e.g. Asynq).
// Publisher: [Inject] and [InjectLogContext] on NATS headers (used by shared/nats PublishMessage).
// Worker: jetstream subscriber copies headers into Asynq via [AsynqHeadersFromNATS]; the worker mux
// calls [ExtractFromStringMap] and [BindLogContextFromStringMap] before running each task handler—pass that ctx into logs.*Ctx and HTTP/DB calls.
package natsprop

import (
	"context"

	natslib "github.com/nats-io/nats.go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type headerCarrier natslib.Header

func (c headerCarrier) Get(key string) string {
	return natslib.Header(c).Get(key)
}

func (c headerCarrier) Set(key, value string) {
	natslib.Header(c).Set(key, value)
}

func (c headerCarrier) Keys() []string {
	h := natslib.Header(c)
	keys := make([]string, 0, len(h))
	for k := range h {
		keys = append(keys, k)
	}
	return keys
}

// Inject adds W3C trace context and baggage from ctx into NATS message headers (mutates h).
func Inject(ctx context.Context, h natslib.Header) {
	if ctx == nil || h == nil {
		return
	}
	otel.GetTextMapPropagator().Inject(ctx, headerCarrier(h))
}

// Extract returns a context with the remote span from NATS message headers, if present.
func Extract(ctx context.Context, h natslib.Header) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if len(h) == 0 {
		return ctx
	}
	return otel.GetTextMapPropagator().Extract(ctx, headerCarrier(h))
}

// ExtractFromStringMap returns a context with the remote span from a flat header map (e.g. Asynq task headers).
func ExtractFromStringMap(ctx context.Context, headers map[string]string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if len(headers) == 0 {
		return ctx
	}
	cp := make(map[string]string, len(headers))
	for k, v := range headers {
		if v != "" {
			cp[k] = v
		}
	}
	if len(cp) == 0 {
		return ctx
	}
	return otel.GetTextMapPropagator().Extract(ctx, propagation.MapCarrier(cp))
}

// AsynqHeadersFromContext serialises the trace context from ctx into a string map suitable for
// asynq.NewTaskWithHeaders, so child tasks stay on the same trace as the current span.
// Returns nil if nothing was injected (e.g. no active span).
func AsynqHeadersFromContext(ctx context.Context) map[string]string {
	if ctx == nil {
		return nil
	}
	m := make(map[string]string)
	otel.GetTextMapPropagator().Inject(ctx, propagation.MapCarrier(m))
	if len(m) == 0 {
		return nil
	}
	return m
}

// AsynqHeadersFromNATS copies NATS message headers into a string map for asynq.NewTaskWithHeaders
// (single value per key; propagators may set traceparent, tracestate, baggage, sentry-trace, etc.).
func AsynqHeadersFromNATS(h natslib.Header) map[string]string {
	if len(h) == 0 {
		return nil
	}
	out := make(map[string]string, len(h))
	for k := range h {
		if v := h.Get(k); v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
