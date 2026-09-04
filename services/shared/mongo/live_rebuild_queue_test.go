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

const rebuildQueueScratchAccount = "eip-parity-rebuild-account"

// The claim protocol only really exists once a server is applying the writes.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_rebuildQueue_claimProtocol(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	coll := mongo.AccountRebuildQueue.Collection()
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_id": models.AccountOwner(rebuildQueueScratchAccount).Key()})
	}
	clean()
	t.Cleanup(clean)

	first := time.Now().UTC().Truncate(time.Millisecond)
	if err := mongo.QueueOwnerWork(ctx, models.AccountOwner(rebuildQueueScratchAccount), eipmongo.StatsWorkRebuild, first); err != nil {
		t.Fatalf("QueueAccountRebuild: %v", err)
	}

	queued := findScratch(t, ctx, mongo)
	if len(queued) != 1 {
		t.Fatalf("queued = %d accounts, want 1", len(queued))
	}
	if queued[0].Claim != 1 {
		t.Fatalf("first claim = %d, want 1", queued[0].Claim)
	}

	// A second request re-queues without resetting the wait time.
	later := first.Add(time.Hour)
	if err := mongo.QueueOwnerWork(ctx, models.AccountOwner(rebuildQueueScratchAccount), eipmongo.StatsWorkRebuild, later); err != nil {
		t.Fatalf("re-queue: %v", err)
	}
	var stored struct {
		QueuedAt time.Time `bson:"queuedAt"`
		Claim    int64     `bson:"claim"`
	}
	if err := coll.FindOne(ctx, bson.M{"_id": models.AccountOwner(rebuildQueueScratchAccount).Key()}).Decode(&stored); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if !stored.QueuedAt.Equal(first) {
		t.Fatalf("queuedAt = %v, want the first request's time %v", stored.QueuedAt, first)
	}
	if stored.Claim != 2 {
		t.Fatalf("claim after re-queue = %d, want 2", stored.Claim)
	}

	// A rebuild holding the stale claim must not clear the account.
	owner := models.AccountOwner(rebuildQueueScratchAccount)
	cleared, err := mongo.ClearQueuedOwner(ctx, eipmongo.QueuedOwner{Owner: owner, Claim: 1})
	if err != nil {
		t.Fatalf("ClearQueuedOwner (stale): %v", err)
	}
	if cleared {
		t.Fatal("stale claim cleared the account; the re-queued request was lost")
	}
	if len(findScratch(t, ctx, mongo)) != 1 {
		t.Fatal("account should still be queued after a stale clear")
	}

	// The current claim clears it.
	cleared, err = mongo.ClearQueuedOwner(ctx, eipmongo.QueuedOwner{Owner: owner, Claim: 2})
	if err != nil {
		t.Fatalf("ClearQueuedOwner (current): %v", err)
	}
	if !cleared {
		t.Fatal("current claim did not clear the account")
	}
	if len(findScratch(t, ctx, mongo)) != 0 {
		t.Fatal("account should be gone after clearing on the current claim")
	}
}

func findScratch(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) []eipmongo.QueuedOwner {
	t.Helper()
	all, err := mongo.ListQueuedOwners(ctx, time.Time{})
	if err != nil {
		t.Fatalf("ListQueuedAccounts: %v", err)
	}
	var out []eipmongo.QueuedOwner
	for _, a := range all {
		if a.Owner.ID == rebuildQueueScratchAccount {
			out = append(out, a)
		}
	}
	return out
}

// A fold may only write while its claim is the current one, so the same
// condition that lets it clear the entry has to be readable before it writes.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_rebuildQueue_claimCurrencyGuardsAFold(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(rebuildQueueScratchAccount)
	coll := mongo.AccountRebuildQueue.Collection()
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_id": owner.Key()})
	}
	clean()
	t.Cleanup(clean)

	now := time.Now().UTC()
	if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkDelta, now); err != nil {
		t.Fatalf("queue delta: %v", err)
	}
	queued := findScratch(t, ctx, mongo)
	if len(queued) != 1 || queued[0].Work != eipmongo.StatsWorkDelta {
		t.Fatalf("queued = %+v, want one delta entry", queued)
	}
	dispatched := queued[0]

	current, err := mongo.OwnerClaimIsCurrent(ctx, dispatched)
	if err != nil {
		t.Fatalf("OwnerClaimIsCurrent: %v", err)
	}
	if !current {
		t.Fatal("a fold holding the dispatched claim should be allowed to write")
	}

	// A rebuild taking the owner on bumps the claim, which is what the fold reads
	// as "something else is accounting for these rows".
	if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkRebuild, now.Add(time.Minute)); err != nil {
		t.Fatalf("upgrade to rebuild: %v", err)
	}
	current, err = mongo.OwnerClaimIsCurrent(ctx, dispatched)
	if err != nil {
		t.Fatalf("OwnerClaimIsCurrent after upgrade: %v", err)
	}
	if current {
		t.Fatal("a fold superseded by a rebuild must not write")
	}

	// A rebuild that swept the entry leaves nothing to match, and that too has to
	// stop the fold: its rows are counted by the rebuild that removed the entry.
	upgraded := findScratch(t, ctx, mongo)
	if len(upgraded) != 1 || upgraded[0].Work != eipmongo.StatsWorkRebuild {
		t.Fatalf("upgraded = %+v, want one rebuild entry", upgraded)
	}
	if _, err := mongo.ClearQueuedOwner(ctx, upgraded[0]); err != nil {
		t.Fatalf("clear: %v", err)
	}
	current, err = mongo.OwnerClaimIsCurrent(ctx, dispatched)
	if err != nil {
		t.Fatalf("OwnerClaimIsCurrent after clear: %v", err)
	}
	if current {
		t.Fatal("a fold whose entry has been swept must not write")
	}
}
