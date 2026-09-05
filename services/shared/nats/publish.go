package nats

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"

	"eve-industry-planner/shared/telemetry"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// PublishTask publishes payload on a task's subject, retrying on connection and
// stream errors.
//
// The subject names the task; taskType only labels the span. The worker resolves
// which task to run from the subject alone, so nothing in the body repeats it.
//
// W3C trace context from ctx rides on the message and is copied into the Asynq
// task headers by the worker subscriber, so a handler logging through
// logs.InfoCtx and friends stays linked to the API span.
func (n *NATS) PublishTask(ctx context.Context, subject string, taskType string, payload any) (err error) {

	var payloadJSON json.RawMessage
	if payload != nil {
		payloadJSON, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}
	taskDataAttrs := payloadSpanAttrs(payload)
	ctx, span := startPublishTaskSpan(ctx, subject, taskType, taskDataAttrs)
	defer func() {
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, err.Error())
		} else {
			span.SetStatus(codes.Ok, "")
		}
		span.End()
	}()

	msg := Message{
		Type: MessageTypeTask,
		Data: payloadJSON,
	}
	return n.Publish(ctx, subject, msg)
}

// PublishEmpty publishes a bodiless trigger message, retrying up to five times
// with exponential backoff on connection and stream errors.
func (n *NATS) PublishEmpty(ctx context.Context, subject string) error {
	msg := Message{
		Type: MessageTypeEmpty,
		Data: nil,
	}
	return n.Publish(ctx, subject, msg)
}

// PublishMessage publishes to JetStream under [PublishRetry], injecting trace context into headers.
func (n *NATS) Publish(ctx context.Context, subject string, msg any) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if n == nil || n.js == nil {
		return fmt.Errorf("nats handle is required")
	}
	msgData, err := encodeMessage(msg)
	if err != nil {
		return err
	}

	hdr := make(natslib.Header)
	natsprop.Inject(ctx, hdr)
	natsprop.InjectLogContext(ctx, hdr)
	outgoing := &natslib.Msg{Subject: subject, Data: msgData, Header: hdr}

	// A batching handle does not wait here; its acks are collected by Wait, and
	// retrying a publish whose ack has not been seen would duplicate it.
	if n.batch != nil {
		return n.publishAsync(outgoing)
	}

	var pubAck *jetstream.PubAck
	err = Retry(ctx, PublishRetry, "jetstream publish "+subject, func() error {
		if !n.Connected() {
			return ErrNotConnected
		}
		ack, publishErr := n.js.PublishMsg(ctx, outgoing)
		if publishErr != nil {
			return publishErr
		}
		pubAck = ack
		return nil
	})
	if err != nil {
		return err
	}

	detail := map[string]any{"subject": subject}
	if pubAck != nil {
		detail["sequence"] = pubAck.Sequence
	}
	logs.AttachDebugStepOrDebugCtx(ctx, "jetstream_published", "JetStream message published", detail)
	return nil
}

// encodeMessage marshals a payload; []byte passes through unchanged.
func encodeMessage(msg any) ([]byte, error) {
	if bytes, ok := msg.([]byte); ok {
		return bytes, nil
	}
	return json.Marshal(msg)
}

const otelTracerNameNATS = "eve-industry-planner/shared/nats"

// SpanAttributed is implemented by a payload that contributes attributes to the
// span covering its publish and its execution.
type SpanAttributed interface {
	SpanAttributes() []attribute.KeyValue
}

// payloadSpanAttrs returns a payload's own span attributes, if it declares any.
func payloadSpanAttrs(payload any) []attribute.KeyValue {
	if sa, ok := payload.(SpanAttributed); ok {
		return sa.SpanAttributes()
	}
	return nil
}

// startPublishTaskSpan starts a producer span for a JetStream task publish.
func startPublishTaskSpan(ctx context.Context, subject, taskType string, taskDataAttrs []attribute.KeyValue) (context.Context, trace.Span) {
	tracer := telemetry.Tracer("shared/nats")
	opts := []trace.SpanStartOption{
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "nats"),
			attribute.String("messaging.destination.name", subject),
			attribute.String("task.type", taskType),
		),
	}
	if len(taskDataAttrs) > 0 {
		opts = append(opts, trace.WithAttributes(taskDataAttrs...))
	}
	return tracer.Start(ctx, "nats.publish_task", opts...)
}
