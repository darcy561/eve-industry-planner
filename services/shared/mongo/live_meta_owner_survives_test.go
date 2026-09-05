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

// A saved job must keep the owner its `_meta` carries.
//
// This is the one property that would have caught a whole class of bug rather
// than an instance of it. `_meta` holds server-owned facts, and the writers that
// `$set` a marshalled struct replace the subdocument entire — so a field the Go
// model does not know about is erased by an ordinary save rather than preserved.
// Nothing asserted that, so a migration could stamp every document and normal
// use would quietly undo it.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_savingAJob_keepsTheOwnerOnItsMeta(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	mongolive.ScratchAccount(t, mongo, metaOwnerScratchAccount)

	const jobID = "job-meta-owner-survives"
	job := models.Job{JobID: jobID, Name: "owner survival", ItemID: 34, JobType: 0}

	// The document exists before the owner is stamped, the way a migration meets
	// it: written by the app, then given an owner it did not have.
	if _, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, metaOwnerScratchAccount, []models.Job{job}, time.Now().UTC(), "", "",
	); err != nil {
		t.Fatalf("seed the job: %v", err)
	}

	owner := models.AccountOwner(metaOwnerScratchAccount)
	if _, err := mongo.JobDocuments.Collection().UpdateOne(ctx,
		bson.M{"_id": jobID},
		bson.M{"$set": bson.M{"_meta.owner": bson.M{"kind": string(owner.Kind), "id": owner.ID}}},
	); err != nil {
		t.Fatalf("stamp the owner: %v", err)
	}
	if got := storedOwner(t, ctx, mongo, jobID); got != owner {
		t.Fatalf("stamp did not take: got %+v", got)
	}

	// An ordinary save, exactly as the API performs one.
	if _, _, err := mongo.JobDocuments.BulkUpsertJobs(
		ctx, metaOwnerScratchAccount, []models.Job{job}, time.Now().UTC(), "", "",
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
	if err := mongo.JobDocuments.Collection().FindOne(ctx, bson.M{"_id": jobID}).Decode(&doc); err != nil {
		t.Fatalf("read back the job: %v", err)
	}
	return doc.Meta.Owner
}

// A rebuilt statistics row must keep its owner when the rebuild writes it again.
//
// This is the mirror of the job case and the opposite contract: the rebuild owns
// `_meta` outright, so the owner belongs in `$set`. Put it in `$setOnInsert` and
// the first rebuild looks correct while every later one leaves the owner behind
// on whatever it was — and `LoadProductionTotals` filters on exactly that, so a
// wrong owner returns no rows and reports no error.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
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
