package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const rebuildQueueScratchAccount = "eip-parity-rebuild-account"

// The claim protocol only really exists once a server is applying the writes.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_rebuildQueue_claimProtocol(t *testing.T) {
	mongo := requireLiveMongo(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	coll := mongo.AccountRebuildQueue.Collection()
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 15*time.Second)
		defer c()
		_, _ = coll.DeleteMany(cctx, bson.M{"_id": models.AccountStatsOwner(rebuildQueueScratchAccount).Key()})
	}
	clean()
	t.Cleanup(clean)

	first := time.Now().UTC().Truncate(time.Millisecond)
	if err := mongo.QueueAccountRebuild(ctx, rebuildQueueScratchAccount, first); err != nil {
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
	if err := mongo.QueueAccountRebuild(ctx, rebuildQueueScratchAccount, later); err != nil {
		t.Fatalf("re-queue: %v", err)
	}
	var stored struct {
		QueuedAt time.Time `bson:"queuedAt"`
		Claim    int64     `bson:"claim"`
	}
	if err := coll.FindOne(ctx, bson.M{"_id": models.AccountStatsOwner(rebuildQueueScratchAccount).Key()}).Decode(&stored); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if !stored.QueuedAt.Equal(first) {
		t.Fatalf("queuedAt = %v, want the first request's time %v", stored.QueuedAt, first)
	}
	if stored.Claim != 2 {
		t.Fatalf("claim after re-queue = %d, want 2", stored.Claim)
	}

	// A rebuild holding the stale claim must not clear the account.
	deleted, err := mongo.ClearQueuedOwners(ctx, []eipmongo.QueuedOwner{{Owner: models.AccountStatsOwner(rebuildQueueScratchAccount), Claim: 1}})
	if err != nil {
		t.Fatalf("ClearQueuedOwners (stale): %v", err)
	}
	if deleted != 0 {
		t.Fatalf("stale claim cleared %d accounts; the re-queued request was lost", deleted)
	}
	if len(findScratch(t, ctx, mongo)) != 1 {
		t.Fatal("account should still be queued after a stale clear")
	}

	// The current claim clears it.
	deleted, err = mongo.ClearQueuedOwners(ctx, []eipmongo.QueuedOwner{{Owner: models.AccountStatsOwner(rebuildQueueScratchAccount), Claim: 2}})
	if err != nil {
		t.Fatalf("ClearQueuedOwners (current): %v", err)
	}
	if deleted != 1 {
		t.Fatalf("current claim cleared %d accounts, want 1", deleted)
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
