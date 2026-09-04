package nats

import (
	"context"
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
		ctx, endSpan := BeginConsumerContext(context.Background(), tracerName, spanName, msg)
		defer endSpan()

		subject := msg.Subject()
		deliveryCount, _ := GetMessageMetadata(msg)
		detail := map[string]any{"subject": subject}

		err := handler(ctx, msg)
		switch {
		case err == nil:
			AcknowledgeMessage(ctx, msg, spanName, deliveryCount)
			// A handler that reported an outcome the generic one cannot express —
			// how many clients a fan-out reached, say — is not followed by a
			// second log line saying less about the same message.
			if !outcomeAlreadyReported(ctx) {
				FinishNATSConsumerOperation(ctx, "debug", spanName+" handled", detail)
			}

		case IsTerminal(err):
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

// IsTerminal reports work that must not be retried, wherever in an error's chain
// that was decided. The worker's task engine asks the same question of a task's
// error as the consumer asks of a message's, so both are answered here.
func IsTerminal(err error) bool {
	var t terminal
	return errors.As(err, &t)
}
