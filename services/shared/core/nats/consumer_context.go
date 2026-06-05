package nats

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"

	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// BeginConsumerContext builds ctx for NATS message handling: remote trace, request identity,
// operation debug-step store, consumer span, and a scoped logger when identity is present.
// envelope may be nil when the payload is not a [Message] wrapper.
func BeginConsumerContext(
	parent context.Context,
	tracerName, spanName string,
	msg jetstream.Msg,
	envelope *Message,
) (context.Context, func()) {
	ctx := parent
	if ctx == nil {
		ctx = context.Background()
	}

	ctx = natsprop.Extract(ctx, msg.Headers())
	ctx = natsprop.BindLogContextFromHeaders(ctx, msg.Headers())

	if envelope != nil {
		if envelope.TraceCarrierTraceparent != "" || envelope.TraceCarrierTracestate != "" {
			hdr := MergeTraceCarrierIntoHeaders(nil,
				envelope.TraceCarrierTraceparent, envelope.TraceCarrierTracestate)
			ctx = natsprop.ExtractFromStringMap(ctx, hdr)
		}
		if envelope.LogContext != nil {
			ctx = natsprop.BindLogContext(ctx,
				envelope.LogContext.RequestID,
				envelope.LogContext.AccountID,
				envelope.LogContext.SessionID,
			)
		}
	}

	ctx = logs.BeginOperationContext(ctx)
	ctx = logs.EnsureOperationLogger(ctx)

	subject := ""
	if msg != nil {
		subject = msg.Subject()
	}
	deliveryCount, sequence := GetMessageMetadata(msg)

	tracer := otel.Tracer(tracerName)
	attrs := []attribute.KeyValue{
		attribute.String("messaging.system", "nats"),
	}
	if subject != "" {
		attrs = append(attrs, attribute.String("messaging.destination.name", subject))
	}
	ctx, span := tracer.Start(ctx, spanName,
		trace.WithSpanKind(trace.SpanKindConsumer),
		trace.WithAttributes(attrs...),
	)

	stepDetail := map[string]interface{}{
		"subject":        subject,
		"delivery_count": deliveryCount,
		"sequence":       sequence,
	}
	if rid := logs.RequestIDFromContext(ctx); rid != "" {
		stepDetail["request_id"] = rid
	}
	logs.AttachDebugStepCtx(ctx, "nats_message_received", stepDetail)

	return ctx, func() { span.End() }
}

// FinishNATSConsumerOperation records a terminal debug step and emits one access-shaped outcome log.
func FinishNATSConsumerOperation(ctx context.Context, level, msg string, detail map[string]interface{}) {
	if detail == nil {
		detail = make(map[string]interface{})
	}
	if start, ok := logs.RequestStartTime(ctx); ok {
		detail["duration_ms"] = time.Since(start).Milliseconds()
	}
	if rid := logs.RequestIDFromContext(ctx); rid != "" {
		if _, ok := detail["request_id"]; !ok {
			detail["request_id"] = rid
		}
	}
	logs.AttachDebugStepCtx(ctx, "nats_message_completed", detail)
	steps := logs.DebugStepsFromContext(ctx)
	caveats := logs.HandlerCaveatsFromContext(ctx)
	logs.EmitAccessShapedLog(ctx, level, msg, detail, steps, caveats)
}
