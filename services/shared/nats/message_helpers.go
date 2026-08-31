package nats

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// AcknowledgeMessage acks under [AckRetry], falling back to [NackMessage] when every attempt fails.
func AcknowledgeMessage(ctx context.Context, msg jetstream.Msg, reason string, deliveryCount uint64) {
	if msg == nil {
		return
	}
	// An ack is owed whatever became of the work's context: keep its values, drop its cancellation.
	ctx = context.WithoutCancel(ctx)
	err := Retry(ctx, AckRetry, "jetstream ack", func() error { return msg.Ack() })
	if err != nil {
		logs.WarnCtx(ctx, "failed to ack message, nacking",
			"error", err,
			"reason", reason,
			"delivery_count", deliveryCount)
		NackMessage(ctx, msg)
		return
	}
	if deliveryCount > 1 {
		logs.DebugCtx(ctx, "message acknowledged", "reason", reason, "delivery_count", deliveryCount)
	}
}

// GetDeliveryCount returns the number of times a message has been delivered.
func GetDeliveryCount(msg jetstream.Msg) uint64 {
	md, err := msg.Metadata()
	if err != nil {
		return 1
	}
	return md.NumDelivered
}

// parseTaskMessageData extracts the payload nested inside a TaskMessage envelope.
func parseTaskMessageData[T any](taskMsgData json.RawMessage, result *T) error {
	var taskMsg TaskMessage
	if err := json.Unmarshal(taskMsgData, &taskMsg); err != nil {
		return fmt.Errorf("failed to unmarshal TaskMessage: %w", err)
	}
	if taskMsg.Data == nil {
		return fmt.Errorf("TaskMessage has no data field")
	}
	if err := json.Unmarshal(taskMsg.Data, result); err != nil {
		return fmt.Errorf("failed to unmarshal task message payload: %w", err)
	}
	return nil
}

// UnmarshalMessagePayloadBytes parses the same [Message] envelope as [UnmarshalMessagePayload] from raw bytes
// (e.g. core NATS subscription callbacks).
func UnmarshalMessagePayloadBytes[T any](data []byte) (T, error) {
	var result T
	if len(data) == 0 {
		return result, fmt.Errorf("message has no data")
	}

	var expectedType string
	if mt, ok := any(result).(MessageType); ok {
		expectedType = mt.MessageType()
	}

	var msgWrapper Message
	if err := json.Unmarshal(data, &msgWrapper); err == nil && msgWrapper.Data != nil {
		if expectedType != "" && msgWrapper.Type != expectedType {
			return result, fmt.Errorf("message type mismatch: expected %s, got %s", expectedType, msgWrapper.Type)
		}
		if msgWrapper.Type == MessageTypeTask {
			if err := parseTaskMessageData(msgWrapper.Data, &result); err != nil {
				return result, err
			}
			return result, nil
		}
		if err := json.Unmarshal(msgWrapper.Data, &result); err != nil {
			return result, fmt.Errorf("failed to unmarshal message payload: %w", err)
		}
		return result, nil
	}

	return result, fmt.Errorf("message does not match expected Message wrapper format")
}

// UnmarshalMessagePayload decodes a [Message] envelope's payload as T, unwrapping the
// inner TaskMessage for task messages. If T implements [MessageType] the envelope type
// must match.
func UnmarshalMessagePayload[T any](msg jetstream.Msg) (T, error) {
	return UnmarshalMessagePayloadBytes[T](msg.Data())
}

// GetMessageMetadata returns message metadata for logging purposes.
// Returns the delivery count and a formatted sequence string (stream/consumer).
func GetMessageMetadata(msg jetstream.Msg) (uint64, string) {
	md, err := msg.Metadata()
	if err != nil {
		return 1, "unknown"
	}
	sequenceStr := fmt.Sprintf("%d/%d", md.Sequence.Stream, md.Sequence.Consumer)
	return md.NumDelivered, sequenceStr
}

// NackMessage naks with backoff from the delivery count (1s, 2s, 4s … 60s), terminating at the cap.
func NackMessage(ctx context.Context, msg jetstream.Msg) {
	if msg == nil {
		return
	}
	const maxNackDeliveries = 5
	deliveries := GetDeliveryCount(msg)
	if deliveries >= maxNackDeliveries {
		logs.WarnCtx(ctx, "nats message terminated after max deliveries", "deliveries", deliveries)
		_ = msg.Term()
		return
	}
	delaySecs := min(1<<(deliveries-1), 60)
	logs.WarnCtx(ctx, "nats message nak with backoff", "deliveries", deliveries, "delay_secs", delaySecs)
	_ = msg.NakWithDelay(time.Duration(delaySecs) * time.Second)
}

// NackMessageWithDelay naks with an explicit delay, falling back to [NackMessage].
func NackMessageWithDelay(ctx context.Context, msg jetstream.Msg, delay time.Duration) {
	if msg == nil {
		return
	}
	ctx = context.WithoutCancel(ctx)
	err := Retry(ctx, AckRetry, "jetstream nak", func() error { return msg.NakWithDelay(delay) })
	if err != nil {
		logs.WarnCtx(ctx, "failed to nack with delay, falling back to backoff nack",
			"error", err, "requested_delay", delay)
		NackMessage(ctx, msg)
	}
}

// InProgressMessage extends the ack deadline; failure is logged and processing continues.
func InProgressMessage(ctx context.Context, msg jetstream.Msg) {
	if msg == nil {
		return
	}
	if err := Retry(ctx, AckRetry, "jetstream in-progress", func() error { return msg.InProgress() }); err != nil {
		logs.DebugCtx(ctx, "failed to send in-progress heartbeat", "error", err)
	}
}
