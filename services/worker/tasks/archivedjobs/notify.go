package archivedjobs

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// notifyStatisticsProcessed tells an owner's clients that their figures moved.
//
// Published and forgotten. A failure to publish is logged rather than returned:
// the figures are already written, so failing the task here would rewrite them
// to send a message whose only job is to save a client from waiting for its next
// request. A client that misses one still learns the truth when it asks.
//
// Only an owner kind that has clients is worth a message; corporation and
// alliance tenants have none yet.
func notifyStatisticsProcessed(ctx context.Context, nats *eipnats.NATS, owner models.Owner, at time.Time) {
	if nats == nil || owner.Kind != models.OwnerAccount || owner.ID == "" {
		return
	}
	body := eipnats.ArchiveStatsProcessedNotification{
		OwnerKind:   string(owner.Kind),
		AccountID:   owner.ID,
		ProcessedAt: at.UTC().Format(time.RFC3339),
	}
	if err := eipnats.PublishAccountNotification(
		nats, owner.ID, eipnats.NotificationArchiveStatsProcessed, body,
	); err != nil {
		logs.WarnCtx(ctx, "statistics notification not published",
			"component", "archivedjobs", "owner_kind", owner.Kind, "error", err)
	}
}
