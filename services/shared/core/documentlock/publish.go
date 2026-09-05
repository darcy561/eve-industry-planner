package documentlock

import (
	"context"
	"fmt"

	eipnats "eve-industry-planner/shared/nats"
)

// PublishDocLockNotification delivers a lock event to websocket workers (doc.lock.{accountID} on JetStream).
func PublishDocLockNotification(ctx context.Context, n *eipnats.NATS, accountID string, payload any) error {
	if n == nil || accountID == "" {
		return nil
	}
	subject := fmt.Sprintf("%s.%s", eipnats.SubjectDocLock, accountID)
	return n.Publish(ctx, subject, payload)
}
