package documentlock

import (
	"context"

	eipnats "eve-industry-planner/shared/nats"
)

// PublishLockEvent injects accountID and publishes the lock notification to JetStream.
// The domain discriminator must be stored under LockPayloadEventKey ("event").
func PublishLockEvent(ctx context.Context, n *eipnats.NATS, accountID string, payload map[string]any) error {
	payload["accountID"] = accountID
	return PublishDocLockNotification(ctx, n, accountID, payload)
}
