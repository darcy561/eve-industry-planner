package nats

import (
	"encoding/json"
	"fmt"
	"time"

	"eve-industry-planner/shared/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
)

// AcknowledgeMessage acknowledges a NATS message with appropriate logging.
// This is preferred over calling msg.Ack() directly because it provides observability:
// - Logs the reason for acknowledgment (e.g., "lock already held", "server unavailable")
// - Logs the delivery count for monitoring retry patterns
// - Handles nil checks and retries acknowledgment with exponential backoff before giving up
// - If all acknowledgment attempts fail, automatically falls back to NackMessage with backoff for retry
//
// reason describes why the message is being acknowledged (e.g., "lock already held", "server unavailable").
// deliveryCount is the number of times this message has been delivered, used for logging purposes.
func AcknowledgeMessage(msg jetstream.Msg, reason string, deliveryCount uint64) {
	if msg == nil {
		return
	}

	const maxAckAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAckAttempts; attempt++ {
		if ackErr := msg.Ack(); ackErr == nil {
			logs.Info("message acknowledged", "reason", reason, "delivery_count", deliveryCount, "attempt", attempt)
			return
		} else {
			lastErr = ackErr
		}

		// If this is the last attempt, fall back to NACK
		if attempt == maxAckAttempts {
			logs.Warn("failed to ack message after all attempts, nacking",
				"error", lastErr,
				"reason", reason,
				"delivery_count", deliveryCount,
				"attempts", maxAckAttempts)
			NackMessage(msg)
			return
		}

		// Exponential backoff: 100ms, 200ms, 400ms
		backoffMs := 100 * (1 << (attempt - 1))
		logs.Debug("ack attempt failed, retrying with backoff",
			"attempt", attempt,
			"max_attempts", maxAckAttempts,
			"backoff_ms", backoffMs,
			"error", lastErr,
			"reason", reason)
		time.Sleep(time.Duration(backoffMs) * time.Millisecond)
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

// UnmarshalMessagePayload extracts and unmarshals the payload from a jetstream.Msg.
// This function expects messages to be wrapped in a Message structure with type and data fields.
// For task messages (Message.Type == "task"), the Message.Data contains a TaskMessage JSON,
// which is then parsed to extract the actual payload from TaskMessage.Data.
//
// Parameters:
//   - msg: The jetstream.Msg to parse
//
// Returns the unmarshalled payload of type T and an error if the message cannot be parsed or if the message type doesn't match.
// If T implements MessageType, the function will automatically validate that the message type matches.
//
// Example:
//
//	req, err := natscore.UnmarshalMessagePayload[ScheduleRequest](msg)
//
// parseTaskMessageData is a helper function to extract and parse the payload from a TaskMessage.
func parseTaskMessageData[T any](taskMsgData json.RawMessage, result *T) error {
	var taskMsg TaskMessage
	if err := json.Unmarshal(taskMsgData, &taskMsg); err != nil {
		return fmt.Errorf("failed to unmarshal TaskMessage: %w", err)
	}
	if taskMsg.Data == nil {
		return fmt.Errorf("TaskMessage has no data field")
	}
	// Parse TaskMessage.Data as the target type
	if err := json.Unmarshal(taskMsg.Data, result); err != nil {
		return fmt.Errorf("failed to unmarshal task message payload: %w", err)
	}
	return nil
}

func UnmarshalMessagePayload[T any](msg jetstream.Msg) (T, error) {
	var result T
	data := msg.Data()
	if len(data) == 0 {
		return result, fmt.Errorf("message has no data")
	}

	// Determine expected type from the generic type if it implements MessageType
	var expectedType string
	if mt, ok := any(result).(MessageType); ok {
		expectedType = mt.MessageType()
	}

	// Try to parse as Message wrapper first (with type and data fields)
	var msgWrapper Message
	if err := json.Unmarshal(data, &msgWrapper); err == nil && msgWrapper.Data != nil {
		// If expectedType is determined, validate it matches
		if expectedType != "" && msgWrapper.Type != expectedType {
			return result, fmt.Errorf("message type mismatch: expected %s, got %s", expectedType, msgWrapper.Type)
		}
		// If Message.Type is "task", the Data field contains a TaskMessage JSON
		// We need to parse it as TaskMessage first, then extract TaskMessage.Data
		if msgWrapper.Type == MessageTypeTask {
			if err := parseTaskMessageData(msgWrapper.Data, &result); err != nil {
				return result, err
			}
			return result, nil
		}
		// For other message types, parse Message.Data directly as the target type
		if err := json.Unmarshal(msgWrapper.Data, &result); err != nil {
			return result, fmt.Errorf("failed to unmarshal message payload: %w", err)
		}
		return result, nil
	}

	// If we get here, the message doesn't match the expected Message wrapper format
	return result, fmt.Errorf("message does not match expected Message wrapper format")
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

// NackMessage performs a NAK with exponential backoff based on delivery count,
// and terminates the message after a maximum number of deliveries.
// Backoff schedule: 1s, 2s, 4s, 8s, ... capped at 60s.
func NackMessage(msg jetstream.Msg) {
	const maxDeliveries = 5
	deliveries := GetDeliveryCount(msg)
	if deliveries >= maxDeliveries {
		logs.Warn("nats message terminated after max deliveries", "deliveries", deliveries, "reason", "max_retries_exceeded")
		_ = msg.Term()
		return
	}
	delaySecs := min(1<<(deliveries-1), 60)
	logs.Warn("nats message nak with backoff", "deliveries", deliveries, "delay_secs", delaySecs, "reason", "retry_with_backoff")
	_ = msg.NakWithDelay(time.Duration(delaySecs) * time.Second)
}

// NackMessageWithDelay performs a NAK with a specific delay, retrying with exponential backoff if the operation fails.
// If all retry attempts fail, falls back to NackMessage for standard backoff handling.
//
// delay is the desired delay before redelivery.
// This function will retry the NakWithDelay operation up to 3 times with exponential backoff (100ms, 200ms, 400ms)
// if the initial operation fails, providing resilience against transient NATS connection issues.
func NackMessageWithDelay(msg jetstream.Msg, delay time.Duration) {
	if msg == nil {
		return
	}

	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if nakErr := msg.NakWithDelay(delay); nakErr == nil {
			logs.Debug("message nacked with delay", "delay", delay, "attempt", attempt)
			return
		} else {
			lastErr = nakErr
		}

		// If this is the last attempt, fall back to standard NackMessage
		if attempt == maxAttempts {
			logs.Warn("failed to nack with delay after all attempts, falling back to standard nack",
				"error", lastErr,
				"requested_delay", delay,
				"attempts", maxAttempts)
			NackMessage(msg)
			return
		}

		// Exponential backoff: 100ms, 200ms, 400ms
		backoffMs := 100 * (1 << (attempt - 1))
		logs.Debug("nak with delay attempt failed, retrying with backoff",
			"attempt", attempt,
			"max_attempts", maxAttempts,
			"backoff_ms", backoffMs,
			"requested_delay", delay,
			"error", lastErr)
		time.Sleep(time.Duration(backoffMs) * time.Millisecond)
	}
}

// InProgressMessage sends an in-progress heartbeat to NATS, retrying with exponential backoff if the operation fails.
// This is used to extend the acknowledgment deadline for long-running message processing.
// If all retry attempts fail, the error is logged but the function returns (doesn't block processing).
//
// This function will retry the InProgress operation up to 3 times with exponential backoff (100ms, 200ms, 400ms)
// if the initial operation fails, providing resilience against transient NATS connection issues.
func InProgressMessage(msg jetstream.Msg) {
	if msg == nil {
		return
	}

	const maxAttempts = 3
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if inProgressErr := msg.InProgress(); inProgressErr == nil {
			return
		} else {
			lastErr = inProgressErr
		}

		// If this is the last attempt, just log and return (don't block processing)
		if attempt == maxAttempts {
			logs.Debug("failed to send in-progress heartbeat after all attempts",
				"error", lastErr,
				"attempts", maxAttempts)
			return
		}

		// Exponential backoff: 100ms, 200ms, 400ms
		backoffMs := 100 * (1 << (attempt - 1))
		logs.Debug("in-progress heartbeat attempt failed, retrying with backoff",
			"attempt", attempt,
			"max_attempts", maxAttempts,
			"backoff_ms", backoffMs,
			"error", lastErr)
		time.Sleep(time.Duration(backoffMs) * time.Millisecond)
	}
}
