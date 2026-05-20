package documentlock

import (
	"context"
	"fmt"

	natscore "eve-industry-planner/shared/core/nats"

	"github.com/nats-io/nats.go/jetstream"
)

// PublishDocLockNotification delivers a lock event to websocket workers (doc.lock.{accountID} on JetStream).
func PublishDocLockNotification(ctx context.Context, js jetstream.JetStream, accountID string, payload any) error {
	if js == nil || accountID == "" {
		return nil
	}
	subject := fmt.Sprintf("%s.%s", natscore.SubjectDocLock, accountID)
	return natscore.PublishMessage(ctx, js, subject, payload)
}
