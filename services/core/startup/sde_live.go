package startup

import (
	"context"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/logs"
	taskscore "eve-industry-planner/shared/tasks"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// EnsureLiveSDEExists checks that the object store has a complete live SDE set.
// If missing, publishes checkSDEUpdates once (same trigger as the daily cron).
func EnsureLiveSDEExists(ctx context.Context, js jetstream.JetStream, natsConn *natslib.Conn) error {
	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	b, err := objectstore.OpenStaticData(checkCtx)
	if err != nil {
		return fmt.Errorf("objectstore: %w", err)
	}
	ok, err := sdecore.RequiredLiveReady(checkCtx, b)
	if err != nil {
		return fmt.Errorf("live SDE check: %w", err)
	}
	if ok {
		logs.InfoCtx(ctx, "live SDE present in object store; no bootstrap publish needed")
		return nil
	}

	if js == nil && natsConn == nil {
		return fmt.Errorf("live SDE missing and nats unavailable for checkSDEUpdates publish")
	}

	logs.InfoCtx(ctx, "live SDE missing in object store; publishing checkSDEUpdates bootstrap",
		"subject", taskscore.CheckSDEUpdates.Subject)
	if err := natscore.PublishEmpty(ctx, js, taskscore.CheckSDEUpdates.Subject, natsConn); err != nil {
		return fmt.Errorf("publish checkSDEUpdates: %w", err)
	}
	return nil
}
