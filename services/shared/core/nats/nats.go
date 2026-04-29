package nats

import (
	"context"
	"encoding/json"
	"errors"
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

// Connect establishes a connection and returns it.
// The connection includes automatic reconnection handling.
func Connect() (*natslib.Conn, error) {
	cfg, err := config.LoadConfig()
	if err != nil {
		return nil, err
	}

	retryCount := 5
	retryDelay := 5 * time.Second
	bg := context.Background()

	for i := 0; i < retryCount; i++ {
		// Enable automatic reconnection with callbacks
		opts := []natslib.Option{
			natslib.ReconnectWait(2 * time.Second),
			natslib.MaxReconnects(-1), // Unlimited reconnects
			natslib.DisconnectErrHandler(func(nc *natslib.Conn, err error) {
				if err != nil {
					logs.WarnCtx(bg, "NATS disconnected", "error", err)
				}
			}),
			natslib.ReconnectHandler(func(nc *natslib.Conn) {
				logs.InfoCtx(bg, "NATS reconnected", "url", nc.ConnectedUrl())
			}),
			natslib.ErrorHandler(func(nc *natslib.Conn, sub *natslib.Subscription, err error) {
				if err != nil {
					logs.ErrorCtx(bg, "NATS error", "error", err)
				}
			}),
			natslib.Timeout(retryDelay),
		}

		conn, err := natslib.Connect(cfg.NATS_URL, opts...)
		if err == nil {
			i++
			message := fmt.Sprintf("Connected to NATS on attempt %d/%d", i, retryCount)
			logs.DebugCtx(bg, message, "url", conn.ConnectedUrl())
			return conn, nil
		}
		i++
		message := fmt.Sprintf("Failed to connect to NATS. Attempt %d/%d. Error: %v", i, retryCount, err.Error())
		logs.ErrorCtx(bg, message)
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to NATS after %d attempts. Exiting...", retryCount)
	return nil, errors.New(message)
}

// ConnectJetStream establishes a connection and returns both the connection and JetStream context.
// This is a convenience function for services that need both.
func ConnectJetStream() (*natslib.Conn, jetstream.JetStream, error) {
	conn, err := Connect()
	if err != nil {
		return nil, nil, err
	}

	js, err := GetJetStream(conn)

	if err != nil {
		conn.Close()
		return nil, nil, err
	}

	return conn, js, err
}

// GetJetStream returns a JetStream context from the connection using the new API.
// Use this when you already have a connection.
// Note: JetStream contexts automatically work with NATS connection reconnection.
// If the connection is reconnected, JetStream operations will automatically use the
// reconnected connection without needing to recreate the context.
func GetJetStream(conn *natslib.Conn) (jetstream.JetStream, error) {
	js, err := jetstream.New(conn)
	if err != nil {
		return nil, fmt.Errorf("failed to get JetStream context: %w", err)
	}
	return js, nil
}

// Cleanup drains and closes the provided NATS connection.
func Cleanup(conn *natslib.Conn) {
	if conn == nil {
		return
	}
	_ = conn.Drain()
	conn.Close()
}

// PublishTask publishes a task message to NATS JetStream with retry logic.
// The payload is automatically marshaled and wrapped in a TaskMessage structure.
// W3C propagated context from ctx is attached to the NATS message (traceparent, tracestate, baggage)
// and copied into Asynq task headers by the worker subscriber. Handlers should log with
// logs.InfoCtx(ctx, ...), WarnCtx, or ErrorCtx so otelzap and stdout trace_id stay linked to the API span.
// Optional trailing args can be *natslib.Conn (for connection check on retry) and/or a priority
// queue name (e.g. "priority_5") to override the task type default. Order does not matter.
//
// Examples:
//
//	PublishTask(ctx, js, subject, "refreshMarketPrices", request)
//	PublishTask(ctx, js, subject, "refreshMarketPrices", request, natsConn)
//	PublishTask(ctx, js, subject, "migrateUserDocumentToMongo", payload, natsConn, "priority_5")
func PublishTask(ctx context.Context, js jetstream.JetStream, subject string, taskType string, payload interface{}, opts ...interface{}) (err error) {
	var natsConn *natslib.Conn
	var priority string
	for _, a := range opts {
		switch v := a.(type) {
		case *natslib.Conn:
			natsConn = v
		case string:
			priority = v
		}
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
	if natsConn != nil {
		err = PublishMessage(ctx, js, subject, msg, natsConn)
	} else {
		err = PublishMessage(ctx, js, subject, msg)
	}
	return err
}

// PublishSchedule publishes a schedule request message to NATS JetStream with retry logic.
// The ScheduleRequest is automatically marshaled and wrapped in a Message structure.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
//
// Example:
//
//	PublishSchedule(js, subject, scheduleRequest, natsConn...)
func PublishSchedule(ctx context.Context, js jetstream.JetStream, subject string, scheduleRequest ScheduleRequest, natsConn ...*natslib.Conn) error {
	scheduleData, err := json.Marshal(scheduleRequest)
	if err != nil {
		return err
	}
	msg := Message{
		Type: MessageTypeSchedule,
		Data: scheduleData,
	}
	return PublishMessage(ctx, js, subject, msg, natsConn...)
}

// PublishEmpty publishes an empty message to NATS JetStream with retry logic.
// Used for simple trigger messages where no data is needed.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
//
// Example:
//
//	PublishEmpty(js, subject, natsConn...)
func PublishEmpty(ctx context.Context, js jetstream.JetStream, subject string, natsConn ...*natslib.Conn) error {
	msg := Message{
		Type: MessageTypeEmpty,
		Data: nil,
	}
	return PublishMessage(ctx, js, subject, msg, natsConn...)
}

// PublishMessage publishes a message to NATS JetStream with retry logic.
// This is a general-purpose helper for publishing any message type to NATS.
// The message is automatically marshaled to JSON if it's not already []byte.
// OpenTelemetry trace context from ctx is injected into NATS headers (traceparent, tracestate, baggage) when present.
// Retries up to 5 times with exponential backoff on connection/stream errors.
// If natsConn is provided, it will check connection status and retry on failure.
func PublishMessage[T any](ctx context.Context, js jetstream.JetStream, subject string, msg T, natsConn ...*natslib.Conn) error {
	if ctx == nil {
		ctx = context.Background()
	}
	var msgData []byte
	var err error

	// If msg is already []byte, use it directly; otherwise marshal to JSON
	if bytes, ok := any(msg).([]byte); ok {
		msgData = bytes
	} else {
		switch m := any(msg).(type) {
		case Message:
			m.EnrichTraceCarrierFromContext(ctx)
			msgData, err = json.Marshal(m)
		default:
			msgData, err = json.Marshal(msg)
		}
		if err != nil {
			return err
		}
	}
	maxRetries := 5
	baseDelay := 500 * time.Millisecond
	maxDelay := 5 * time.Second

	var conn *natslib.Conn
	if len(natsConn) > 0 && natsConn[0] != nil {
		conn = natsConn[0]
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Check connection status if connection is provided
		if conn != nil {
			if !conn.IsConnected() {
				// Wait for reconnection with exponential backoff
				if attempt < maxRetries-1 {
					delay := baseDelay * time.Duration(1<<attempt)
					if delay > maxDelay {
						delay = maxDelay
					}
					logs.InfoCtx(ctx, "NATS not connected, waiting for reconnection", "attempt", attempt+1, "delay_ms", delay.Milliseconds())
					time.Sleep(delay)
					continue
				}
				return errors.New("NATS connection is not connected after retries")
			}

			// Wait a bit after reconnection to let JetStream stabilize
			if attempt > 0 {
				time.Sleep(200 * time.Millisecond)
			}
		}

		hdr := make(natslib.Header)
		natsprop.Inject(ctx, hdr)

		publishCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		nmsg := &natslib.Msg{Subject: subject, Data: msgData, Header: hdr}
		pubAck, err := js.PublishMsg(publishCtx, nmsg)
		cancel()
		if err == nil {
			if attempt > 0 {
				logs.InfoCtx(ctx, "JetStream publish succeeded after retry", "attempt", attempt+1, "subject", subject)
			} else {
				// Log successful publish for debugging
				if pubAck != nil {
					logs.DebugCtx(ctx, "JetStream message published", "subject", subject, "sequence", pubAck.Sequence)
				} else {
					logs.DebugCtx(ctx, "JetStream message published", "subject", subject)
				}
			}
			return nil
		}

		lastErr = err

		// Check if error is retryable (connection/stream errors)
		errStr := err.Error()
		isRetryable := strings.Contains(errStr, "no response from stream") ||
			strings.Contains(errStr, "connection closed") ||
			strings.Contains(errStr, "connection drained") ||
			strings.Contains(errStr, "invalid connection") ||
			strings.Contains(errStr, "connection reconnecting") ||
			strings.Contains(errStr, "timeout") ||
			strings.Contains(errStr, "no responders")

		if !isRetryable {
			logs.WarnCtx(ctx, "JetStream publish error is not retryable", "error", errStr, "subject", subject)
			return err
		}

		if attempt == maxRetries-1 {
			logs.ErrorCtx(ctx, "JetStream publish failed after all retries", "attempts", maxRetries, "error", errStr, "subject", subject)
			return err
		}

		// Exponential backoff before retry
		delay := baseDelay * time.Duration(1<<attempt)
		if delay > maxDelay {
			delay = maxDelay
		}
		logs.InfoCtx(ctx, "JetStream publish failed, retrying", "attempt", attempt+1, "max_retries", maxRetries, "delay_ms", delay.Milliseconds(), "error", errStr, "subject", subject)
		time.Sleep(delay)
	}

	return lastErr
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
