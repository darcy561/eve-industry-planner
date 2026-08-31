package archivedjobs

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// rebuildDebounce is how long an owner waits before its rebuild is dispatched.
//
// queuedAt is not moved by a re-queue, so this bounds the longest an owner waits
// rather than sliding: an owner changing continuously is still rebuilt once per
// window. It is the same number read the other way — the shortest gap between two
// of an owner's rebuilds.
const rebuildDebounce = 5 * time.Minute

// DispatchResult summarises one pass over the rebuild queue.
type DispatchResult struct {
	Eligible   int
	Dispatched int
	Failed     int
}

// DrainAccountStatsRebuildQueue dispatches a rebuild for every owner whose wait
// is up.
//
// It performs no rebuild itself. Rebuilding in the dispatcher put every owner
// behind one serial pass inside one task timeout, so a queue larger than that
// window could not finish — and because the clear ran after the loop on the same
// cancelled context, a pass that ran out of time cleared nothing and the next
// pass started from the same place. One task per owner rebuilds in parallel and
// each clears its own, so progress is per owner rather than per pass.
func DrainAccountStatsRebuildQueue(ctx context.Context, _ *asynq.Task, deps *esitasks.TaskDependencies) error {
	if deps == nil || deps.Mongo == nil {
		return fmt.Errorf("mongo client is required")
	}
	if deps.NATS == nil {
		return fmt.Errorf("nats client is required")
	}

	result, err := DispatchQueuedRebuilds(ctx, deps.Mongo, deps.NATS, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("dispatch queued rebuilds: %w", err)
	}

	logs.InfoCtx(ctx, "statistics rebuilds dispatched",
		"component", "archivedjobs",
		"eligible", result.Eligible,
		"dispatched", result.Dispatched,
		"failed", result.Failed,
	)

	if result.Failed > 0 {
		// The owners that failed to publish keep their queue entry, so the next
		// tick picks them up; failing the whole task would republish the ones
		// that already went out.
		logs.AttachHandlerCaveatCtx(ctx, "rebuild_dispatch_failed",
			fmt.Sprintf("%d/%d rebuilds could not be published and stay queued", result.Failed, result.Eligible),
			map[string]any{"failed": result.Failed, "eligible": result.Eligible},
		)
	}

	return nil
}

// DispatchQueuedRebuilds publishes one rebuild task per eligible owner.
func DispatchQueuedRebuilds(ctx context.Context, mongo *eipmongo.Mongo, nats *eipnats.NATS, now time.Time) (DispatchResult, error) {
	var out DispatchResult
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}
	if nats == nil {
		return out, fmt.Errorf("nats handle is required")
	}

	// A delta is what a user is waiting on, so it is eligible at once; the
	// debounce holds back only the expensive kind.
	queued, err := mongo.ListQueuedOwners(ctx, now)
	if err != nil {
		return out, fmt.Errorf("list queued owners: %w", err)
	}

	for _, entry := range queued {
		if err := ctx.Err(); err != nil {
			break
		}
		if entry.Work == eipmongo.StatsWorkRebuild && entry.QueuedAt.After(now.Add(-rebuildDebounce)) {
			continue
		}
		publish := eipnats.PublishRebuildOwnerStatistics
		if entry.Work == eipmongo.StatsWorkDelta {
			publish = eipnats.PublishApplyOwnerStatisticsDelta
		}
		if err := publish(
			ctx, nats, string(entry.Owner.Kind), entry.Owner.ID, entry.Claim,
		); err != nil {
			out.Failed++
			logs.WarnCtx(ctx, "statistics rebuild dispatch failed",
				"component", "archivedjobs", "owner_kind", entry.Owner.Kind, "error", err)
			continue
		}
		out.Dispatched++
	}
	out.Eligible = out.Dispatched + out.Failed

	return out, nil
}
