package documentlock

import (
	"context"

	"github.com/nats-io/nats.go/jetstream"
)

// PublishLockEvent injects accountID and publishes the lock notification to JetStream.
// The domain discriminator must be stored under LockPayloadEventKey ("event").
func PublishLockEvent(ctx context.Context, js jetstream.JetStream, accountID string, payload map[string]any) error {
	payload["accountID"] = accountID
	return PublishDocLockNotification(ctx, js, accountID, payload)
}
