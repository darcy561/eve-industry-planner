package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// ConnectRetry bounds boot-time connection attempts.
var ConnectRetry = RetryPolicy{Attempts: 5, InitialDelay: 5 * time.Second, MaxDelay: 5 * time.Second}

const (
	connectTimeout = 5 * time.Second
	// jetStreamAPITimeout applies only when a caller's context carries no deadline.
	jetStreamAPITimeout = 5 * time.Second
)

// Connect establishes a connection, retrying while ctx allows.
func Connect(ctx context.Context) (*natslib.Conn, error) {
	natsURL, err := config.NATSURL()
	if err != nil {
		return nil, err
	}

	opts := []natslib.Option{
		natslib.ReconnectWait(2 * time.Second),
		natslib.MaxReconnects(-1),
		natslib.ReconnectOnFlusherError(),
		natslib.Timeout(connectTimeout),
		natslib.DisconnectErrHandler(func(_ *natslib.Conn, err error) {
			if err != nil {
				logs.WarnCtx(ctx, "NATS disconnected", "error", err)
			}
		}),
		natslib.ReconnectHandler(func(nc *natslib.Conn) {
			logs.InfoCtx(ctx, "NATS reconnected", "url", nc.ConnectedUrl())
		}),
		natslib.ReconnectErrHandler(func(_ *natslib.Conn, err error) {
			if err != nil {
				logs.WarnCtx(ctx, "NATS reconnect attempt failed", "error", err)
			}
		}),
		natslib.ErrorHandler(func(_ *natslib.Conn, _ *natslib.Subscription, err error) {
			if err != nil {
				logs.ErrorCtx(ctx, "NATS error", "error", err)
			}
		}),
	}

	var conn *natslib.Conn
	err = Retry(ctx, ConnectRetry, "nats connect", func() error {
		c, connErr := natslib.Connect(natsURL, opts...)
		if connErr != nil {
			return connErr
		}
		conn = c
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("connect to NATS: %w", err)
	}
	logs.DebugCtx(ctx, "connected to NATS", "url", conn.ConnectedUrl())
	return conn, nil
}

// Open establishes a connection and returns the handle bound to it.
func Open(ctx context.Context) (*NATS, error) {
	conn, err := Connect(ctx)
	if err != nil {
		return nil, err
	}

	js, err := getJetStream(conn)
	if err != nil {
		conn.Close()
		return nil, err
	}

	handle, err := NewNATS(conn, js)
	if err != nil {
		conn.Close()
		return nil, err
	}
	return handle, nil
}

// GetJetStream returns a JetStream context from the connection using the new API.
// Use this when you already have a connection.
// Note: JetStream contexts automatically work with NATS connection reconnection.
// If the connection is reconnected, JetStream operations will automatically use the
// reconnected connection without needing to recreate the context.
func getJetStream(conn *natslib.Conn) (jetstream.JetStream, error) {
	js, err := jetstream.New(conn, jetstream.WithDefaultTimeout(jetStreamAPITimeout))
	if err != nil {
		return nil, fmt.Errorf("failed to get JetStream context: %w", err)
	}
	return js, nil
}

// PublishTask publishes a task message to NATS JetStream with retry logic.
// The payload is automatically marshaled and wrapped in a TaskMessage structure.
// W3C propagated context from ctx is attached to the NATS message (traceparent, tracestate, baggage)
// and copied into Asynq task headers by the worker subscriber. Handlers should log with
// logs.InfoCtx(ctx, ...), WarnCtx, or ErrorCtx so OTLP logs stay linked to the API span.
// Optional trailing args can be *natslib.Conn (for connection check on retry) and/or a priority
// queue name (e.g. "priority_5") to override the task type default. Order does not matter.
//
// Examples:
//
//	PublishTask(ctx, js, subject, "refreshRegionMarketOrders", request)
//	PublishTask(ctx, js, subject, "refreshRegionMarketOrders", request, natsConn)
//	PublishTask(ctx, js, subject, "migrateUserDocumentToMongo", payload, natsConn, "priority_5")
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

	taskMsg := TaskMessage{
		TaskType: taskType,
	}
	if len(payloadJSON) > 0 {
		taskMsg.Data = payloadJSON
	}
	var taskMsgData []byte
	taskMsgData, err = json.Marshal(taskMsg)
	if err != nil {
		return err
	}
	msg := Message{
		Type: MessageTypeTask,
		Data: taskMsgData,
	}
	return n.Publish(ctx, subject, msg)
}

// PublishEmpty publishes an empty message to NATS JetStream with retry logic.
// Used for simple trigger messages where no data is needed.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
//
// Example:
//
//	PublishEmpty(js, subject, natsConn...)
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
	msgData, err := encodeMessage(ctx, msg)
	if err != nil {
		return err
	}

	var pubAck *jetstream.PubAck
	err = Retry(ctx, PublishRetry, "jetstream publish "+subject, func() error {
		if !n.Connected() {
			return ErrNotConnected
		}
		hdr := make(natslib.Header)
		natsprop.Inject(ctx, hdr)
		natsprop.InjectLogContext(ctx, hdr)

		ack, publishErr := n.js.PublishMsg(ctx, &natslib.Msg{Subject: subject, Data: msgData, Header: hdr})
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

// encodeMessage marshals a payload; []byte passes through, a [Message] is enriched first.
func encodeMessage(ctx context.Context, msg any) ([]byte, error) {
	if bytes, ok := msg.([]byte); ok {
		return bytes, nil
	}
	if m, ok := msg.(Message); ok {
		m.EnrichTraceCarrierFromContext(ctx)
		m.EnrichLogContextFromContext(ctx)
		return json.Marshal(m)
	}
	return json.Marshal(msg)
}

// ExtractIDFromSubject extracts an ID from a NATS subject after a given prefix.
// Subject format: {prefix}.{id} or {prefix}.{nested.id}
// Example: ExtractIDFromSubject("doc.update.user.account123", "doc.update") returns "user.account123"
// Example: ExtractIDFromSubject("doc.subscribe.account123", "doc.subscribe") returns "account123"
// Returns the extracted ID and an error if the subject format is invalid.
func ExtractIDFromSubject(subject string, prefix string) (string, error) {
	// Ensure prefix ends with a dot for proper matching
	prefixWithDot := prefix
	if !strings.HasSuffix(prefix, ".") {
		prefixWithDot = prefix + "."
	}

	// Check if subject starts with prefix
	if !strings.HasPrefix(subject, prefixWithDot) {
		return "", fmt.Errorf("subject does not match prefix: subject=%s, prefix=%s", subject, prefix)
	}

	// Extract the ID part (everything after prefix.)
	id := strings.TrimPrefix(subject, prefixWithDot)
	if id == "" {
		return "", fmt.Errorf("subject has no ID after prefix: subject=%s, prefix=%s", subject, prefix)
	}

	return id, nil
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
	tracer := otel.Tracer(otelTracerNameNATS)
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
