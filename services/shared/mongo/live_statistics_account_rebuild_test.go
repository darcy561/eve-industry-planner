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

func TestLive_accountRebuild_revokeAndPrune(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	now := time.Now().UTC().Truncate(time.Millisecond)

	keptID := eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rebuildStatsScratchAccount), "job-kept")
	goneID := eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rebuildStatsScratchAccount), "job-gone")
	seedStatsRow(t, ctx, mongo, keptID)
	seedStatsRow(t, ctx, mongo, goneID)

	revoked, err := mongo.RevokeArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount), []string{keptID}, now)
	if err != nil {
		t.Fatalf("RevokeArchivedJobStats: %v", err)
	}
	if revoked != 1 {
		t.Fatalf("revoked = %d rows, want 1 (only the job no longer archived)", revoked)
	}
	if isRevoked(t, ctx, mongo, keptID) {
		t.Fatal("a job still in the keep-list was revoked; its history would be dropped from the owner's totals")
	}
	if !isRevoked(t, ctx, mongo, goneID) {
		t.Fatal("a job absent from the keep-list was not revoked")
	}

	if countStatsRows(t, ctx, mongo) != 2 {
		t.Fatal("revoke deleted a row; a job restored from the archive would lose its history")
	}

	revokedAtBefore := revokedAt(t, ctx, mongo, goneID)
	later := now.Add(time.Hour)
	again, err := mongo.RevokeArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount), []string{keptID}, later)
	if err != nil {
		t.Fatalf("second RevokeArchivedJobStats: %v", err)
	}
	if again != 0 {
		t.Fatalf("second revoke modified %d rows, want 0 — the filter is not excluding already-revoked rows", again)
	}
	if got := revokedAt(t, ctx, mongo, goneID); !got.Equal(revokedAtBefore) {
		t.Fatalf("revokedAt moved from %v to %v; a re-revoked row loses the time it was actually removed", revokedAtBefore, got)
	}

	keptBucket := eipmongo.TimelineMonthDocumentID(models.AccountOwner(rebuildStatsScratchAccount), scratchTypeID, 2026, 8, false)
	goneBucket := eipmongo.TimelineMonthDocumentID(models.AccountOwner(rebuildStatsScratchAccount), scratchTypeID, 2026, 7, false)
	seedBucket(t, ctx, mongo, keptBucket)
	seedBucket(t, ctx, mongo, goneBucket)

	pruned, err := mongo.PruneTimelineMonths(ctx, models.AccountOwner(rebuildStatsScratchAccount), []string{keptBucket})
	if err != nil {
		t.Fatalf("PruneTimelineMonths: %v", err)
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

func TestLive_accountRebuild_emptyKeepListClearsTheAccount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	rowID := eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rebuildStatsScratchAccount), "job-only")
	bucketID := eipmongo.TimelineMonthDocumentID(models.AccountOwner(rebuildStatsScratchAccount), scratchTypeID, 2026, 8, false)
	seedStatsRow(t, ctx, mongo, rowID)
	seedBucket(t, ctx, mongo, bucketID)

	revoked, err := mongo.RevokeArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount), nil, time.Now().UTC())
	if err != nil {
		t.Fatalf("RevokeArchivedJobStats: %v", err)
	}
	if revoked != 1 {
		t.Fatalf("revoked = %d rows, want 1", revoked)
	}
	if !isRevoked(t, ctx, mongo, rowID) {
		t.Fatal("an empty keep-list left a row unrevoked; the account's last removed job would keep counting")
	}

	pruned, err := mongo.PruneTimelineMonths(ctx, models.AccountOwner(rebuildStatsScratchAccount), nil)
	if err != nil {
		t.Fatalf("PruneTimelineMonths: %v", err)
	}
	if pruned != 1 {
		t.Fatalf("pruned = %d buckets, want 1", pruned)
	}
	if bucketExists(t, ctx, mongo, bucketID) {
		t.Fatal("an empty keep-list left a bucket in place; the account would keep stale monthly totals")
	}
}

func TestLive_accountRebuild_writesBeforeRemoving(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, rebuildStatsScratchAccount)

	staleID := eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rebuildStatsScratchAccount), "job-stale")
	freshID := eipmongo.ArchivedJobStatsDocumentID(models.AccountOwner(rebuildStatsScratchAccount), "job-fresh")
	seedStatsRow(t, ctx, mongo, staleID)

	seedStatsRow(t, ctx, mongo, freshID)

	rows, err := mongo.LoadArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount))
	if err != nil {
		t.Fatalf("LoadArchivedJobStats: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("mid-rebuild read saw %d rows, want both the outgoing and the incoming", len(rows))
	}
	for _, r := range rows {
		if r.Revoked {
			t.Fatal("a row was revoked before the write half completed; a reader would see a gap")
		}
	}

	if _, err := mongo.RevokeArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount), []string{freshID}, time.Now().UTC()); err != nil {
		t.Fatalf("RevokeArchivedJobStats: %v", err)
	}

	rows, err = mongo.LoadArchivedJobStats(ctx, models.AccountOwner(rebuildStatsScratchAccount))
	if err != nil {
		t.Fatalf("LoadArchivedJobStats after revoke: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("read after revoke saw %d rows, want 2 including the revoked one", len(rows))
	}
}

func seedStatsRow(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) {
	t.Helper()
	row := models.ArchivedJobStats{
		ID:    docID,
		Owner: models.AccountOwner(rebuildStatsScratchAccount),
	}
	if _, err := mongo.StatisticsRows.UpsertStructsPreservingMetaBulk(ctx, []eipmongo.StructUpsertItem{{DocID: docID, Value: row}}, 10); err != nil {
		t.Fatalf("seed stats row %s: %v", docID, err)
	}
}

func seedBucket(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) {
	t.Helper()
	bucket := models.TimelineMonthBucket{
		ID:    docID,
		Owner: models.AccountOwner(rebuildStatsScratchAccount),
	}
	if _, err := mongo.StatisticsTimeline.UpsertStructsPreservingMetaBulk(ctx, []eipmongo.StructUpsertItem{{DocID: docID, Value: bucket}}, 10); err != nil {
		t.Fatalf("seed bucket %s: %v", docID, err)
	}
}

func isRevoked(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) bool {
	t.Helper()
	var stored struct {
		Revoked bool `bson:"revoked"`
	}
	if err := mongo.StatisticsRows.Collection().FindOne(ctx, bson.M{"_id": docID}).Decode(&stored); err != nil {
		t.Fatalf("read stats row %s: %v", docID, err)
	}
	return stored.Revoked
}

func countStatsRows(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo) int64 {
	t.Helper()
	n, err := mongo.StatisticsRows.Collection().CountDocuments(ctx, bson.M{
		eipmongo.FieldMetaOwnerKind: models.OwnerAccount,
		eipmongo.FieldMetaOwnerID:   rebuildStatsScratchAccount,
	})
	if err != nil {
		t.Fatalf("count stats rows: %v", err)
	}
	return n
}

func bucketExists(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, docID string) bool {
	t.Helper()
	n, err := mongo.StatisticsTimeline.Collection().CountDocuments(ctx, bson.M{"_id": docID})
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
	if err := mongo.StatisticsRows.Collection().FindOne(ctx, bson.M{"_id": docID}).Decode(&stored); err != nil {
		t.Fatalf("read revokedAt %s: %v", docID, err)
	}
	return stored.RevokedAt
}
