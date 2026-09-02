package archivedjobs

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"github.com/hibiken/asynq"
)

// stopIfOutOfAttempts records a failure and stops retrying once asynq has no
// attempts left, returning the error the task should return.
//
// Repeated failure must not become a loop. Up to the ceiling the error is
// returned as-is and asynq retries it under its own backoff; at the ceiling the
// failure is written to the queue entry and the task stops, which is what lets a
// read tell the user their figures are stale rather than showing a recalculation
// that never resolves.
//
// The entry itself is left queued. The work is still outstanding, and a later
// request — or a fixed deployment — clears the failure by succeeding.
func stopIfOutOfAttempts(ctx context.Context, mongo *eipmongo.Mongo, owner models.StatsOwner, cause error) error {
	retried, hasRetried := asynq.GetRetryCount(ctx)
	maxRetry, hasMax := asynq.GetMaxRetry(ctx)
	if !hasRetried || !hasMax || retried < maxRetry {
		return cause
	}

	if mongo != nil {
		if err := mongo.RecordOwnerWorkFailure(ctx, owner, cause.Error(), time.Now().UTC()); err != nil {
			logs.WarnCtx(ctx, "statistics failure not recorded",
				"component", "archivedjobs", "owner_kind", owner.Kind, "error", err)
		}
	}
	logs.ErrorCtx(ctx, "statistics work gave up",
		"component", "archivedjobs",
		"owner_kind", owner.Kind,
		"attempts", retried+1,
		"error", cause,
	)
	return errStoppedAfterRetries{cause: cause}
}

// errStoppedAfterRetries carries the original failure while telling asynq not to
// schedule another attempt.
type errStoppedAfterRetries struct{ cause error }

func (e errStoppedAfterRetries) Error() string { return e.cause.Error() }
func (e errStoppedAfterRetries) Unwrap() error { return e.cause }

// Is reports asynq.SkipRetry so the queue stops redispatching, without hiding
// what actually failed from anything unwrapping the cause.
func (e errStoppedAfterRetries) Is(target error) bool { return target == asynq.SkipRetry }

// forgetFailuresIfStillQueued clears a recorded failure after work that
// succeeded but could not clear its entry.
//
// The entry stands for a request that arrived while the work ran, not for the
// run that failed before it, so leaving the failure would report a failed
// recalculation for work that is merely outstanding.
func forgetFailuresIfStillQueued(ctx context.Context, mongo *eipmongo.Mongo, owner models.StatsOwner, cleared bool) {
	if cleared || mongo == nil {
		return
	}
	if err := mongo.ClearOwnerWorkFailure(ctx, owner); err != nil {
		logs.WarnCtx(ctx, "statistics failure not cleared",
			"component", "archivedjobs", "owner_kind", owner.Kind, "error", err)
	}
}
