package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const recalcScratchAccount = "eip-parity-recalc-account"

// What a read tells a client comes from the queue entry, so the three states have
// to fall out of the three entries that produce them.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_recalculationState_readsTheQueueEntry(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountStatsOwner(recalcScratchAccount)
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_, _ = mongo.AccountRebuildQueue.Collection().DeleteMany(cctx, bson.M{"_id": owner.Key()})
	}
	clean()
	t.Cleanup(clean)

	state := func(t *testing.T) eipmongo.RecalculationState {
		t.Helper()
		got, err := mongo.OwnerRecalculationState(ctx, owner)
		if err != nil {
			t.Fatalf("OwnerRecalculationState: %v", err)
		}
		return got
	}

	if got := state(t); got != eipmongo.RecalculationCurrent {
		t.Fatalf("no entry = %q, want current", got)
	}

	// A fold is invisible here. An owner is in the queue briefly every time a job
	// is archived, and announcing a recalculation for that is the opposite of
	// what this reports.
	now := time.Now().UTC()
	if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkDelta, now); err != nil {
		t.Fatalf("queue delta: %v", err)
	}
	if got := state(t); got != eipmongo.RecalculationCurrent {
		t.Fatalf("queued delta = %q, want current", got)
	}

	if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkRebuild, now); err != nil {
		t.Fatalf("queue rebuild: %v", err)
	}
	if got := state(t); got != eipmongo.RecalculationRunning {
		t.Fatalf("queued rebuild = %q, want recalculating", got)
	}

	if err := mongo.RecordOwnerWorkFailure(ctx, owner, "mongo unavailable", now); err != nil {
		t.Fatalf("RecordOwnerWorkFailure: %v", err)
	}
	if got := state(t); got != eipmongo.RecalculationFailed {
		t.Fatalf("exhausted rebuild = %q, want failed", got)
	}

	// Work that succeeds but cannot clear its entry leaves a request outstanding,
	// not a failure — the failure belongs to a run that has since worked.
	if err := mongo.ClearOwnerWorkFailure(ctx, owner); err != nil {
		t.Fatalf("ClearOwnerWorkFailure: %v", err)
	}
	if got := state(t); got != eipmongo.RecalculationRunning {
		t.Fatalf("after forgetting failures = %q, want recalculating", got)
	}
}
