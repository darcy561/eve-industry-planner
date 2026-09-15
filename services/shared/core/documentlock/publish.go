package documentlock

import (
	"context"
	"fmt"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// PublishDocLockNotification delivers a lock event to websocket workers (doc.lock.{owner} on JetStream).
func PublishDocLockNotification(ctx context.Context, n *eipnats.NATS, owner models.Owner, payload any) error {
	if n == nil || owner.IsZero() {
		return nil
	}
	subject := fmt.Sprintf("%s.%s", eipnats.SubjectDocLock, owner.Key())
	return n.Publish(ctx, subject, payload)
}
