package archivedjobs

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const reconcileScratchAccount = "eip-parity-reconcile-account"

// scratchRow is one archived job's figures, written straight into the rows
// collection so a reconcile has something authoritative to fold.
func scratchRow(jobID string, typeID int, costMonth models.CalendarMonth, sale float64) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		ID:                 eipmongo.ArchivedJobStatsDocumentID(reconcileScratchAccount, jobID),
		AccountID:          reconcileScratchAccount,
		JobID:              jobID,
		TypeID:             typeID,
		CostMonth:          costMonth,
		TotalProduced:      10,
		TotalMaterialCost:  700,
		TotalInstallCost:   200,
		TotalExtras:        100,
		TotalInventionCost: 50,
		TransactionLines: []models.ArchivedJobTransactionLine{
			{CalendarMonth: costMonth, Quantity: 10, Amount: sale, Tax: sale * 0.02},
		},
	}
}

// Reconciliation exists to make aggregates agree with the rows beneath them
// again, whatever went wrong. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_reconcile_restoresAggregatesAndReportsTheDrift(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		scope := bson.M{"accountID": reconcileScratchAccount}
		_, _ = mongo.ArchivedJobStats.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountTimelineMonths.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountProductionTotals.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountReconcileRota.Collection().DeleteMany(cctx,
			bson.M{"_id": models.AccountOwner(reconcileScratchAccount).Key()})
		_, _ = mongo.AccountRebuildQueue.Collection().DeleteMany(cctx,
			bson.M{"_id": models.AccountOwner(reconcileScratchAccount).Key()})
	}
	clean()
	t.Cleanup(clean)

	rows := []models.ArchivedJobStats{
		scratchRow("job-reconcile-1", 34, models.CalendarMonth{Year: 2026, Month: 3}, 5000),
		scratchRow("job-reconcile-2", 34, models.CalendarMonth{Year: 2026, Month: 3}, 7000),
		scratchRow("job-reconcile-3", 35, models.CalendarMonth{Year: 2026, Month: 4}, 9000),
	}
	items := make([]eipmongo.StructUpsertItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, eipmongo.StructUpsertItem{DocID: row.ID, Value: row})
	}
	if _, err := mongo.ArchivedJobStats.UpsertStructsPreservingMetaBulk(ctx, items, 100); err != nil {
		t.Fatalf("seed rows: %v", err)
	}

	now := time.Now().UTC()
	first, err := ReconcileAccountStatistics(ctx, mongo, reconcileScratchAccount, now)
	if err != nil {
		t.Fatalf("first reconcile: %v", err)
	}
	if first.Buckets == 0 || first.Totals == 0 {
		t.Fatalf("first reconcile wrote nothing: %+v", first)
	}
	baselineBuckets, err := mongo.LoadAccountTimelineMonths(ctx, reconcileScratchAccount)
	if err != nil {
		t.Fatalf("read baseline buckets: %v", err)
	}
	baselineTotals, err := mongo.LoadAccountProductionTotals(ctx, reconcileScratchAccount, 0)
	if err != nil {
		t.Fatalf("read baseline totals: %v", err)
	}

	// Break the aggregates in each of the ways a delta can: money off, a count
	// off, a document that should exist gone, and one that should not, left.
	bucketColl := mongo.AccountTimelineMonths.Collection()
	if _, err := bucketColl.UpdateOne(ctx, bson.M{"_id": baselineBuckets[0].ID},
		bson.M{"$inc": bson.M{"salesTotal": 12345.67, "contributingRows": 4}}); err != nil {
		t.Fatalf("corrupt a bucket: %v", err)
	}
	if _, err := bucketColl.DeleteOne(ctx, bson.M{"_id": baselineBuckets[len(baselineBuckets)-1].ID}); err != nil {
		t.Fatalf("delete a bucket: %v", err)
	}
	orphan := baselineBuckets[0]
	orphan.ID = eipmongo.AccountTimelineMonthDocumentID(reconcileScratchAccount, 99999, 2019, 1, false)
	orphan.TypeID, orphan.Year, orphan.Month = 99999, 2019, 1
	if _, err := mongo.AccountTimelineMonths.UpsertStructPreservingMeta(ctx, orphan, orphan.ID); err != nil {
		t.Fatalf("insert an orphan bucket: %v", err)
	}

	second, err := ReconcileAccountStatistics(ctx, mongo, reconcileScratchAccount, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("second reconcile: %v", err)
	}

	if !second.Drifted() {
		t.Fatal("deliberately broken aggregates reported no drift")
	}
	if second.BucketDrift.MoneyOff != 1 {
		t.Errorf("MoneyOff = %d, want 1", second.BucketDrift.MoneyOff)
	}
	if second.BucketDrift.CountsOff != 1 {
		t.Errorf("CountsOff = %d, want 1", second.BucketDrift.CountsOff)
	}
	if second.BucketDrift.Missing != 1 {
		t.Errorf("Missing = %d, want 1 — the deleted bucket", second.BucketDrift.Missing)
	}
	if second.BucketDrift.Extra != 1 {
		t.Errorf("Extra = %d, want 1 — the orphan", second.BucketDrift.Extra)
	}

	// Reporting is not the point; the documents have to be right again.
	repairedBuckets, err := mongo.LoadAccountTimelineMonths(ctx, reconcileScratchAccount)
	if err != nil {
		t.Fatalf("read repaired buckets: %v", err)
	}
	repairedTotals, err := mongo.LoadAccountProductionTotals(ctx, reconcileScratchAccount, 0)
	if err != nil {
		t.Fatalf("read repaired totals: %v", err)
	}
	if drift := compareBucketSets(baselineBuckets, repairedBuckets); drift != "" {
		t.Fatalf("buckets not restored: %s", drift)
	}
	if len(repairedTotals) != len(baselineTotals) {
		t.Fatalf("totals = %d documents, want %d", len(repairedTotals), len(baselineTotals))
	}

	// A reconcile over correct aggregates writes the same values and says so.
	third, err := ReconcileAccountStatistics(ctx, mongo, reconcileScratchAccount, now.Add(2*time.Minute))
	if err != nil {
		t.Fatalf("third reconcile: %v", err)
	}
	if third.Drifted() {
		t.Fatalf("correct aggregates reported drift: buckets %+v totals %+v", third.BucketDrift, third.TotalDrift)
	}
}

// compareBucketSets reports the first difference between two sets of buckets, or
// an empty string when they hold the same documents with the same figures.
func compareBucketSets(want, got []models.AccountTimelineMonthBucket) string {
	if len(want) != len(got) {
		return "document counts differ"
	}
	byID := make(map[string]models.AccountTimelineMonthBucket, len(got))
	for _, doc := range got {
		byID[doc.ID] = doc
	}
	for _, expect := range want {
		have, ok := byID[expect.ID]
		if !ok {
			return "missing " + expect.ID
		}
		if have.ContributingRows != expect.ContributingRows {
			return "contributingRows differ on " + expect.ID
		}
		if have.SalesTotal != expect.SalesTotal || have.JobCostTotal != expect.JobCostTotal {
			return "figures differ on " + expect.ID
		}
	}
	return ""
}
