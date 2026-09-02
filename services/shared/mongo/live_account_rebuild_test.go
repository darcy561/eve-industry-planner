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

const (
	rebuildStatsScratchAccount = "eip-parity-rebuild-stats-account"
	scratchTypeID              = 34
)

// Revoke and prune are the half of the rebuild that removes things, and they are
// the half a wholesale rebuild runs on real data every hour. Both filter with
// `$nin` over a keep-list, which only behaves the way the rebuild assumes once a
// server is applying it.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_accountRebuild_revokeAndPrune(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	now := time.Now().UTC().Truncate(time.Millisecond)

	keptID := eipmongo.ArchivedJobStatsDocumentID(rebuildStatsScratchAccount, "job-kept")
	goneID := eipmongo.ArchivedJobStatsDocumentID(rebuildStatsScratchAccount, "job-gone")
	seedStatsRow(t, ctx, mongo, keptID)
	seedStatsRow(t, ctx, mongo, goneID)

	// A rebuild that still produces job-kept must revoke only job-gone.
	revoked, err := mongo.RevokeAccountArchivedJobStats(ctx, rebuildStatsScratchAccount, []string{keptID}, now)
	if err != nil {
		t.Fatalf("RevokeAccountArchivedJobStats: %v", err)
	}
	if revoked != 1 {
		t.Fatalf("revoked = %d rows, want 1 (only the job no longer archived)", revoked)
	}
	if isRevoked(t, ctx, mongo, keptID) {
		t.Fatal("a job still in the keep-list was revoked; its history would be dropped from the account's totals")
	}
	if !isRevoked(t, ctx, mongo, goneID) {
		t.Fatal("a job absent from the keep-list was not revoked")
	}

	// Rows are revoked, never deleted, so a restored job keeps its history.
	if countStatsRows(t, ctx, mongo) != 2 {
		t.Fatal("revoke deleted a row; a job restored from the archive would lose its history")
	}

	// Revoke skips rows it has already revoked, which is what makes a retried
	// rebuild safe. The second pass uses a *later* timestamp deliberately: `$set`
	// writes revokedAt as well as revoked, so re-matching an already-revoked row
	// would change it and be counted. Passing the same `now` would make this
	// assertion hold even without the `revoked: {$ne: true}` guard, since Mongo
	// reports no modification when a write changes nothing.
	revokedAtBefore := revokedAt(t, ctx, mongo, goneID)
	later := now.Add(time.Hour)
	again, err := mongo.RevokeAccountArchivedJobStats(ctx, rebuildStatsScratchAccount, []string{keptID}, later)
	if err != nil {
		t.Fatalf("second RevokeAccountArchivedJobStats: %v", err)
	}
	if again != 0 {
		t.Fatalf("second revoke modified %d rows, want 0 — the filter is not excluding already-revoked rows", again)
	}
	if got := revokedAt(t, ctx, mongo, goneID); !got.Equal(revokedAtBefore) {
		t.Fatalf("revokedAt moved from %v to %v; a re-revoked row loses the time it was actually removed", revokedAtBefore, got)
	}

	// Pruning keeps the months the rebuild produced and drops the rest.
	keptBucket := eipmongo.AccountTimelineMonthDocumentID(rebuildStatsScratchAccount, scratchTypeID, 2026, 8, false)
	goneBucket := eipmongo.AccountTimelineMonthDocumentID(rebuildStatsScratchAccount, scratchTypeID, 2026, 7, false)
	seedBucket(t, ctx, mongo, keptBucket)
	seedBucket(t, ctx, mongo, goneBucket)

	pruned, err := mongo.PruneAccountTimelineMonths(ctx, rebuildStatsScratchAccount, []string{keptBucket})
	if err != nil {
		t.Fatalf("PruneAccountTimelineMonths: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("pruned = %d buckets, want 1", pruned)
	}
	if !bucketExists(t, ctx, mongo, keptBucket) {
		t.Fatal("a month the rebuild produced was pruned")
	}
	if bucketExists(t, ctx, mongo, goneBucket) {
		t.Fatal("a month with no remaining activity survived the prune and keeps stale totals")
	}
}

// An empty keep-list means the rebuild produced nothing, which happens when an
// account's last archived job is removed. Both helpers drop the `$nin` in that
// case, so the filter becomes account-wide — the account is emptied rather than
// left untouched. Pinned because inverting it would silently strip every account
// whose rebuild returned no rows.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_accountRebuild_emptyKeepListClearsTheAccount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	rowID := eipmongo.ArchivedJobStatsDocumentID(rebuildStatsScratchAccount, "job-only")
	bucketID := eipmongo.AccountTimelineMonthDocumentID(rebuildStatsScratchAccount, scratchTypeID, 2026, 8, false)
	seedStatsRow(t, ctx, mongo, rowID)
	seedBucket(t, ctx, mongo, bucketID)

	revoked, err := mongo.RevokeAccountArchivedJobStats(ctx, rebuildStatsScratchAccount, nil, time.Now().UTC())
	if err != nil {
		t.Fatalf("RevokeAccountArchivedJobStats: %v", err)
	}
	if revoked != 1 {
		t.Fatalf("revoked = %d rows, want 1", revoked)
	}
	if !isRevoked(t, ctx, mongo, rowID) {
		t.Fatal("an empty keep-list left a row unrevoked; the account's last removed job would keep counting")
	}

	pruned, err := mongo.PruneAccountTimelineMonths(ctx, rebuildStatsScratchAccount, nil)
	if err != nil {
		t.Fatalf("PruneAccountTimelineMonths: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("pruned = %d buckets, want 1", pruned)
	}
	if bucketExists(t, ctx, mongo, bucketID) {
		t.Fatal("an empty keep-list left a bucket in place; the account would keep stale monthly totals")
	}
}

// The rebuild writes rows and buckets before removing anything, so a reader
// arriving mid-rebuild sees the previous complete set or the new one, never a
// gap. This pins the ordering at the point it matters: after the upsert half and
// before the removal half, both the surviving and the outgoing documents are
// readable.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_accountRebuild_writesBeforeRemoving(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	staleID := eipmongo.ArchivedJobStatsDocumentID(rebuildStatsScratchAccount, "job-stale")
	freshID := eipmongo.ArchivedJobStatsDocumentID(rebuildStatsScratchAccount, "job-fresh")
	seedStatsRow(t, ctx, mongo, staleID)

	// The write half of a rebuild: the new row lands while the outgoing one is
	// still present and unrevoked.
	seedStatsRow(t, ctx, mongo, freshID)

	rows, err := mongo.LoadAccountArchivedJobStats(ctx, rebuildStatsScratchAccount)
	if err != nil {
		t.Fatalf("LoadAccountArchivedJobStats: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("mid-rebuild read saw %d rows, want both the outgoing and the incoming", len(rows))
	}
	for _, r := range rows {
		if r.Revoked {
			t.Fatal("a row was revoked before the write half completed; a reader would see a gap")
		}
	}

	// Only now does the removal half run.
	if _, err := mongo.RevokeAccountArchivedJobStats(ctx, rebuildStatsScratchAccount, []string{freshID}, time.Now().UTC()); err != nil {
		t.Fatalf("RevokeAccountArchivedJobStats: %v", err)
	}

	// LoadAccountArchivedJobStats returns revoked rows too, so a later rebuild can
	// tell a removed job from one it has never seen.
	rows, err = mongo.LoadAccountArchivedJobStats(ctx, rebuildStatsScratchAccount)
	if err != nil {
		t.Fatalf("LoadAccountArchivedJobStats after revoke: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("read after revoke saw %d rows, want 2 including the revoked one", len(rows))
	}
}

func seedStatsRow(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) {
	t.Helper()
	row := models.ArchivedJobStats{
		ID:        docID,
		AccountID: rebuildStatsScratchAccount,
	}
	if _, err := mongo.ArchivedJobStats.UpsertStructsPreservingMetaBulk(ctx, []eipmongo.StructUpsertItem{{DocID: docID, Value: row}}, 10); err != nil {
		t.Fatalf("seed stats row %s: %v", docID, err)
	}
}

func seedBucket(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) {
	t.Helper()
	bucket := models.AccountTimelineMonthBucket{
		ID:        docID,
		AccountID: rebuildStatsScratchAccount,
	}
	if _, err := mongo.AccountTimelineMonths.UpsertStructsPreservingMetaBulk(ctx, []eipmongo.StructUpsertItem{{DocID: docID, Value: bucket}}, 10); err != nil {
		t.Fatalf("seed bucket %s: %v", docID, err)
	}
}

func isRevoked(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) bool {
	t.Helper()
	var stored struct {
		Revoked bool `bson:"revoked"`
	}
	if err := mongo.ArchivedJobStats.Collection().FindOne(ctx, bson.M{"_id": docID}).Decode(&stored); err != nil {
		t.Fatalf("read stats row %s: %v", docID, err)
	}
	return stored.Revoked
}

func countStatsRows(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int64 {
	t.Helper()
	n, err := mongo.ArchivedJobStats.Collection().CountDocuments(ctx, bson.M{"accountID": rebuildStatsScratchAccount})
	if err != nil {
		t.Fatalf("count stats rows: %v", err)
	}
	return n
}

func bucketExists(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) bool {
	t.Helper()
	n, err := mongo.AccountTimelineMonths.Collection().CountDocuments(ctx, bson.M{"_id": docID})
	if err != nil {
		t.Fatalf("count bucket %s: %v", docID, err)
	}
	return n > 0
}

func revokedAt(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) time.Time {
	t.Helper()
	var stored struct {
		RevokedAt time.Time `bson:"revokedAt"`
	}
	if err := mongo.ArchivedJobStats.Collection().FindOne(ctx, bson.M{"_id": docID}).Decode(&stored); err != nil {
		t.Fatalf("read revokedAt %s: %v", docID, err)
	}
	return stored.RevokedAt
}
