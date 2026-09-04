package nats_test

import (
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"

	"github.com/nats-io/nats.go/jetstream"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// The task envelope carries the trace and log context a second time, in its JSON
// body, on the stated grounds that JetStream may deliver without user headers.
// Everything downstream then has to merge the two sources.
//
// This asks the server directly. If a delivered message carries the headers, the
// copy in the body is duplicated state and the merge is work done for a case
// that does not arise.
func TestJetStreamDeliversTheHeadersItWasPublishedWith(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})
	tracer := sdktrace.NewTracerProvider().Tracer("test")

	nats := natsfake.New(t)
	if _, err := nats.NATS.Tasks.Ensure(t.Context()); err != nil {
		t.Fatalf("ensure stream: %v", err)
	}

	ctx, span := tracer.Start(t.Context(), "publisher")
	defer span.End()

	if err := eipnats.PublishRefreshRegionMarketOrders(ctx, nats.NATS, 10000002, 60003760); err != nil {
		t.Fatalf("publish: %v", err)
	}

	consumer, err := nats.NATS.Tasks.Consumer(t.Context(), jetstream.ConsumerConfig{
		Durable:       "trace-header-probe",
		FilterSubject: eipnats.RefreshRegionMarketOrders.Subject,
		AckPolicy:     jetstream.AckExplicitPolicy,
		DeliverPolicy: jetstream.DeliverAllPolicy,
	})
	if err != nil {
		t.Fatalf("consumer: %v", err)
	}
	msgs, err := consumer.Fetch(1)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}

	select {
	case msg := <-msgs.Messages():
		if msg == nil {
			t.Fatal("no message delivered")
		}
		got := msg.Headers().Get("traceparent")
		if got == "" {
			t.Fatalf("delivered without a traceparent header; the body copy is load-bearing. headers: %v",
				msg.Headers())
		}
		t.Logf("delivered with traceparent %q", got)
	case <-time.After(10 * time.Second):
		t.Fatal("nothing delivered")
	}
}
