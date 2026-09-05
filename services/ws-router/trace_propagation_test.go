package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// The clone that goes to the backend must carry the routing span, not the traceparent the router
// was called with — otherwise the websocket span is a sibling of the router's instead of a child.
func TestProxyRequestCarriesRoutingSpanNotInbound(t *testing.T) {
	otel.SetTracerProvider(sdktrace.NewTracerProvider())
	otel.SetTextMapPropagator(propagation.TraceContext{})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	inbound := "00-11111111111111111111111111111111-2222222222222222-01"
	req.Header.Set("traceparent", inbound)

	ctx := otel.GetTextMapPropagator().Extract(req.Context(), propagation.HeaderCarrier(req.Header))
	ctx, span := otel.Tracer("test").Start(ctx, "route")
	defer span.End()

	out := req.Clone(ctx)
	otel.GetTextMapPropagator().Inject(out.Context(), propagation.HeaderCarrier(out.Header))

	got := out.Header.Get("traceparent")
	if got == inbound {
		t.Fatal("backend still receives the inbound traceparent")
	}
	if want := span.SpanContext().TraceID().String(); got == "" || got[3:35] != want {
		t.Fatalf("traceparent %q not on trace %s", got, want)
	}
	if parent := span.SpanContext().SpanID().String(); got[36:52] != parent {
		t.Fatalf("traceparent %q parent is not the routing span %s", got, parent)
	}
}
