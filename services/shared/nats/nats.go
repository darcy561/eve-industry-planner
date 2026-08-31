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
	"go.opentelemetry.io/otel/codes"
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

	js, err := GetJetStream(conn)
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
func GetJetStream(conn *natslib.Conn) (jetstream.JetStream, error) {
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
func PublishTask(ctx context.Context, n *NATS, subject string, taskType string, payload any, opts ...string) (err error) {
	priority := ""
	if len(opts) > 0 {
		priority = opts[0]
	}

	var payloadJSON json.RawMessage
	if payload != nil {
		payloadJSON, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}
	taskDataAttrs := taskDataAttrsFromJSON(taskType, payloadJSON)
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
	if priority != "" {
		taskMsg.Priority = priority
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
	return PublishMessage(ctx, n, subject, msg)
}

// PublishEmpty publishes an empty message to NATS JetStream with retry logic.
// Used for simple trigger messages where no data is needed.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
//
// Example:
//
//	PublishEmpty(js, subject, natsConn...)
func PublishEmpty(ctx context.Context, n *NATS, subject string) error {
	msg := Message{
		Type: MessageTypeEmpty,
		Data: nil,
	}
	return PublishMessage(ctx, n, subject, msg)
}

// PublishMessage publishes to JetStream under [PublishRetry], injecting trace context into headers.
func PublishMessage[T any](ctx context.Context, n *NATS, subject string, msg T) error {
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
func encodeMessage[T any](ctx context.Context, msg T) ([]byte, error) {
	if bytes, ok := any(msg).([]byte); ok {
		return bytes, nil
	}
	if m, ok := any(msg).(Message); ok {
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
