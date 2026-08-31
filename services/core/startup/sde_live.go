package startup

import (
	"context"
	sdecore "eve-industry-planner/shared/core/sde"
	"fmt"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
)

// EnsureLiveSDEExists checks that the object store has a complete live SDE set.
// If missing, publishes checkSDEUpdates once (same trigger as the daily cron).
func EnsureLiveSDEExists(ctx context.Context, natsHandle *eipnats.NATS) error {
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

	if natsHandle == nil {
		return fmt.Errorf("live SDE missing and nats unavailable for checkSDEUpdates publish")
	}

	logs.InfoCtx(ctx, "live SDE missing in object store; publishing checkSDEUpdates bootstrap",
		"subject", taskscore.CheckSDEUpdates.Subject)
	if err := eipnats.PublishEmpty(ctx, natsHandle, taskscore.CheckSDEUpdates.Subject); err != nil {
		return fmt.Errorf("publish checkSDEUpdates: %w", err)
	}
	return nil
}
