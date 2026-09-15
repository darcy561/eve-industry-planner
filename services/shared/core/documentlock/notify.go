package documentlock

import (
	"context"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// PublishLockEvent names the planner on the payload and publishes the lock
// notification to JetStream. The domain discriminator must be stored under
// LockPayloadEventKey ("event").
//
// The owner is rendered as its key: the struct has no JSON tags, so sending it
// whole would put a shape nothing reads on the wire.
func PublishLockEvent(ctx context.Context, n *eipnats.NATS, owner models.Owner, payload map[string]any) error {
	payload["owner"] = owner.Key()
	return PublishDocLockNotification(ctx, n, owner, payload)
}
