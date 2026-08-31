package nats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/nats-io/nats.go/jetstream"
)

// Handler processes one message. What it returns decides the message's fate:
//
//	nil          the message is acknowledged
//	Terminate(…) the message is acknowledged and never redelivered — it will
//	             never succeed, so retrying it only wastes deliveries
//	any error    the message is negatively acknowledged and redelivered with
//	             backoff, up to the consumer's limit
//
// A handler never acks for itself. Detail worth logging goes on ctx through the
// shared logging helpers, and is emitted with the outcome.
type Handler func(ctx context.Context, msg jetstream.Msg) error

// terminal marks work that must not be retried.
type terminal struct{ reason string }

func (t terminal) Error() string { return t.reason }

// Terminate reports work that cannot succeed on redelivery — a message this
// service will never understand, or one aimed at something that is not here.
func Terminate(format string, args ...any) error {
	return terminal{reason: fmt.Sprintf(format, args...)}
}

// Handle turns a [Handler] into a processor for [Consume], taking care of the
// consumer context, the span, the outcome log and the acknowledgement.
func Handle(tracerName, spanName string, handler Handler) MessageProcessor {
	return func(msg jetstream.Msg) {
		envelope, hasEnvelope := decodeEnvelope(msg.Data())
		var carrier *Message
		if hasEnvelope {
			carrier = &envelope
		}

		ctx, endSpan := BeginConsumerContext(context.Background(), tracerName, spanName, msg, carrier)
		defer endSpan()

		subject := msg.Subject()
		deliveryCount, _ := GetMessageMetadata(msg)
		detail := map[string]any{"subject": subject}

		err := handler(ctx, msg)
		switch {
		case err == nil:
			AcknowledgeMessage(ctx, msg, spanName, deliveryCount)
			FinishNATSConsumerOperation(ctx, "debug", spanName+" handled", detail)

		case isTerminal(err):
			detail["reason"] = err.Error()
			AcknowledgeMessage(ctx, msg, err.Error(), deliveryCount)
			FinishNATSConsumerOperation(ctx, "warn", spanName+" rejected", detail)

		default:
			detail["error"] = err.Error()
			NackMessage(ctx, msg)
			FinishNATSConsumerOperation(ctx, "warn", spanName+" failed", detail)
		}
	}
}

func isTerminal(err error) bool {
	var t terminal
	return errors.As(err, &t)
}

// decodeEnvelope reads the shared envelope when a message carries one. It holds
// the trace context that lets a consumer span join the publisher's trace when
// JetStream delivers without user headers.
func decodeEnvelope(data []byte) (Message, bool) {
	var envelope Message
	if err := json.Unmarshal(data, &envelope); err != nil || envelope.Type == "" {
		return Message{}, false
	}
	return envelope, true
}
