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

const metaOwnerScratchAccount = "eip-parity-meta-owner-account"

func TestLive_savingAJob_keepsTheOwnerOnItsMeta(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, metaOwnerScratchAccount)

	const jobID = "job-meta-owner-survives"
	job := models.Job{JobID: jobID, Name: "owner survival", ItemID: 34, JobType: 0}

	if _, _, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, models.AccountOwner(metaOwnerScratchAccount), metaOwnerScratchAccount,
		[]models.Job{job}, time.Now().UTC(), "", "",
	); err != nil {
		t.Fatalf("seed the job: %v", err)
	}

	owner := models.AccountOwner(metaOwnerScratchAccount)
	if _, err := mongo.JobDocuments.Collection().UpdateOne(ctx,
		bson.M{"_id": eipmongo.OwnerScopedDocumentID(owner, jobID)},
		bson.M{"$set": bson.M{eipmongo.FieldMetaOwner: mongolive.OwnerDoc(owner)}},
	); err != nil {
		t.Fatalf("stamp the owner: %v", err)
	}
	if got := storedOwner(t, ctx, mongo, jobID); got != owner {
		t.Fatalf("stamp did not take: got %+v", got)
	}

	if _, _, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, models.AccountOwner(metaOwnerScratchAccount), metaOwnerScratchAccount,
		[]models.Job{job}, time.Now().UTC(), "", "",
	); err != nil {
		t.Fatalf("save the job again: %v", err)
	}

	if got := storedOwner(t, ctx, mongo, jobID); got != owner {
		t.Fatalf("saving the job erased its owner: _meta.owner is %+v, want %+v", got, owner)
	}
}

func storedOwner(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, jobID string) models.Owner {
	t.Helper()
	var doc struct {
		Meta struct {
			Owner models.Owner `bson:"owner"`
		} `bson:"_meta"`
	}
	storedID := eipmongo.OwnerScopedDocumentID(models.AccountOwner(metaOwnerScratchAccount), jobID)
	if err := mongo.JobDocuments.Collection().FindOne(ctx, bson.M{"_id": storedID}).Decode(&doc); err != nil {
		t.Fatalf("read back the job: %v", err)
	}
	return doc.Meta.Owner
}

func TestLive_rewritingAStatisticsRow_keepsItFindableByOwner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(metaOwnerScratchAccount)
	const typeID = 34
	docID := eipmongo.ProductionTotalsDocumentID(owner, typeID)
	t.Cleanup(func() {
		_, _ = mongo.StatisticsTotals.Collection().DeleteOne(context.Background(), bson.M{"_id": docID})
	})

	write := func(jobs int64) {
		t.Helper()
		row := models.ProductionTotalsRow{
			ID:        docID,
			Owner:     owner,
			TypeID:    typeID,
			TotalJobs: jobs,
		}
		if _, err := mongo.StatisticsTotals.UpsertStructsWithMetaBulk(
			ctx, []eipmongo.StructUpsertItem{{DocID: docID, Value: row}}, 100,
		); err != nil {
			t.Fatalf("upsert totals (%d jobs): %v", jobs, err)
		}
	}

	write(1)
	write(2)

	rows, err := mongo.LoadProductionTotals(ctx, owner, typeID)
	if err != nil {
		t.Fatalf("load totals: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("owner-scoped load returned %d rows, want 1 — the rewrite lost the owner", len(rows))
	}
	if rows[0].TotalJobs != 2 {
		t.Fatalf("totalJobs = %d, want 2 from the second write", rows[0].TotalJobs)
	}
	if rows[0].Owner != owner {
		t.Fatalf("owner = %+v, want %+v", rows[0].Owner, owner)
	}
}

func TestLive_savingAWatchlist_keepsItFindableByOwner(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	t.Cleanup(func() {
		_, _ = mongo.WatchlistDeprecated.Collection().DeleteOne(
			context.Background(), bson.M{"_id": metaOwnerScratchAccount})
	})

	now := time.Now().UTC()
	if _, err := mongo.WatchlistDeprecated.UpsertWatchlistDeprecated(
		ctx, metaOwnerScratchAccount, []any{}, []any{}, now, "", "",
	); err != nil {
		t.Fatalf("save the watchlist: %v", err)
	}

	if _, err := mongo.WatchlistDeprecated.UpsertWatchlistDeprecated(
		ctx, metaOwnerScratchAccount, []any{}, []any{}, now, "", "",
	); err != nil {
		t.Fatalf("save the watchlist again: %v", err)
	}

	owner := models.AccountOwner(metaOwnerScratchAccount)
	found, err := mongo.WatchlistDeprecated.Collection().CountDocuments(ctx, bson.M{
		eipmongo.FieldMetaOwnerKind: owner.Kind,
		eipmongo.FieldMetaOwnerID:   owner.ID,
	})
	if err != nil {
		t.Fatalf("count by owner: %v", err)
	}
	if found != 1 {
		t.Fatalf("owner-scoped count = %d, want 1 — the save left the document unfindable", found)
	}

	if _, err := mongo.WatchlistDeprecated.LoadWatchlistDeprecated(ctx, metaOwnerScratchAccount); err != nil {
		t.Fatalf("load the watchlist back: %v", err)
	}
}
