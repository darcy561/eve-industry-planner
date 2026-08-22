package archivedjobs

import (
	"context"
	"fmt"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
)

// DrainResult summarises one pass over the rebuild queue.
type DrainResult struct {
	Queued  int
	Rebuilt int
	Cleared int64
	// Requeued counts accounts that changed again while their rebuild was in
	// flight, so they stayed queued for the next pass rather than being cleared.
	Requeued int
	// Failed counts accounts whose rebuild returned an error. They keep their
	// place in the queue.
	Failed int
}

// DrainAccountRebuildQueue rebuilds every account waiting for one.
//
// The claim each account was read with is carried through to the clear, so an
// account re-queued mid-rebuild is not cleared by the rebuild it raced. That is
// the whole reason the queue stores a claim: without it, a change arriving during
// a rebuild would be erased by that rebuild's completion and the account's
// statistics would stay stale with nothing left to say so.
//
// An account whose rebuild fails is left queued rather than cleared, so a
// transient failure retries on the next pass instead of losing the request.
func DrainAccountRebuildQueue(ctx context.Context, mongo *eipmongo.Mongo, now time.Time) (DrainResult, error) {
	var out DrainResult
	if mongo == nil {
		return out, fmt.Errorf("mongo handle is required")
	}

	queued, err := mongo.ListQueuedAccounts(ctx)
	if err != nil {
		return out, fmt.Errorf("list queued accounts: %w", err)
	}
	out.Queued = len(queued)
	if len(queued) == 0 {
		return out, nil
	}

	rebuilt := make([]eipmongo.QueuedAccount, 0, len(queued))
	for _, account := range queued {
		if err := ctx.Err(); err != nil {
			// Stop taking new work on cancellation; what is already rebuilt is
			// still cleared below so the pass is not repeated from scratch.
			break
		}
		if _, err := RebuildAccountStatistics(ctx, mongo, account.AccountID, now); err != nil {
			out.Failed++
			continue
		}
		out.Rebuilt++
		rebuilt = append(rebuilt, account)
	}

	if len(rebuilt) == 0 {
		return out, nil
	}

	cleared, err := mongo.ClearQueuedAccounts(ctx, rebuilt)
	if err != nil {
		return out, fmt.Errorf("clear queued accounts: %w", err)
	}
	out.Cleared = cleared
	out.Requeued = len(rebuilt) - int(cleared)

	return out, nil
}
