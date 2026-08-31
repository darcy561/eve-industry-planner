package nats

import (
	"context"
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

// InProgressMessage extends the ack deadline; failure is logged and processing continues.
func inProgressMessage(ctx context.Context, msg jetstream.Msg) {
	if msg == nil {
		return
	}
	if err := Retry(ctx, AckRetry, "jetstream in-progress", func() error { return msg.InProgress() }); err != nil {
		logs.DebugCtx(ctx, "failed to send in-progress heartbeat", "error", err)
	}
}
