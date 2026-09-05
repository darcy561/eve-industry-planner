package archivedjobs

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const rearchiveScratchAccount = "eip-parity-rearchive-account"

// A job archived, restored and archived again lands on the row its first archive
// left behind. The figures are replaced, but the stamps that say where the row is
// in its life are pointers the encoder omits when unset — so a fresh row has to
// clear them, or the row claims to have been counted while holding figures
// nothing has counted.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_restoreThenRearchiveCountsTheNewFigures(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	owner := models.AccountOwner(rearchiveScratchAccount)
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		scope := bson.M{"accountID": rearchiveScratchAccount}
		_, _ = mongo.ArchivedJobStats.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountTimelineMonths.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.ProductionTotals.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountRebuildQueue.Collection().DeleteMany(cctx, bson.M{"_id": owner.Key()})
	}
	clean()
	t.Cleanup(clean)

	now := time.Now().UTC()
	job := models.Job{
		JobID:               "job-rearchive-1",
		ItemID:              34,
		JobType:             1,
		ItemsProducedPerRun: 10,
		Build: models.JobBuild{
			Setup: map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}},
			Costs: models.JobCosts{LinkedJobs: []models.LinkedESIJob{{JobID: 1, Cost: 1000}}},
		},
	}
	job.MetaData.AccountID = rearchiveScratchAccount
	job.MetaData.ArchivedAt = now

	writeRow := func(t *testing.T, j models.Job) models.ArchivedJobStats {
		t.Helper()
		row, err := archivestats.NewRow(j, now)
		if err != nil {
			t.Fatalf("NewRow: %v", err)
		}
		if err := mongo.WriteStatsRows(ctx, []models.ArchivedJobStats{row}, 100); err != nil {
			t.Fatalf("WriteStatsRows: %v", err)
		}
		return row
	}
	stored := func(t *testing.T, id string) models.ArchivedJobStats {
		t.Helper()
		var out models.ArchivedJobStats
		if err := mongo.ArchivedJobStats.Collection().FindOne(ctx, bson.M{"_id": id}).Decode(&out); err != nil {
			t.Fatalf("read row: %v", err)
		}
		return out
	}

	// Archived, then counted.
	row := writeRow(t, job)
	if err := mongo.StampContributed(ctx, []string{row.ID}, now); err != nil {
		t.Fatalf("StampContributed: %v", err)
	}

	// Restored: the row is revoked while still carrying its contribution stamp,
	// which is the state a re-archive arriving before the next fold lands on.
	if _, err := mongo.RevokeStatsRowsForJobs(ctx, models.AccountOwner(rearchiveScratchAccount), []string{job.JobID}, now); err != nil {
		t.Fatalf("RevokeStatsRowsForJobs: %v", err)
	}
	revoked := stored(t, row.ID)
	if !revoked.Revoked || revoked.ContributedAt == nil || revoked.RevokedAt == nil {
		t.Fatalf("restore left %+v; expected a revoked row that is still counted", revoked)
	}

	// Archived again, with a sale recorded while it was out of the archive, so the
	// figures genuinely differ from the ones in the aggregates.
	job.Build.Sale.Transactions = []models.Transaction{{Quantity: 10, Amount: 5000, Date: now.Format(time.RFC3339)}}
	rearchived := writeRow(t, job)

	after := stored(t, rearchived.ID)
	if after.Revoked {
		t.Fatal("a re-archived job's row is still revoked; the fold would take its figures back out")
	}
	if after.ContributedAt != nil {
		t.Fatal("a re-archived job's row still claims to be counted; its new figures would never be folded in")
	}
	if after.RevokedAt != nil {
		t.Fatal("a live row still carries the moment it was revoked")
	}
	if !after.AwaitsContribution() {
		t.Fatal("a re-archived job's row is not offered to the fold as outstanding")
	}
}

// Restoring the last job of an item type has to leave nothing behind. An absent
// row and an all-zero row mean different things: the totals read serves what it
// finds, so a row of zeros keeps the item listed with nothing to show.
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_restoringTheLastJobRemovesItsTotals(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	const account = rearchiveScratchAccount + "-prune"
	owner := models.AccountOwner(account)
	clean := func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		scope := bson.M{"accountID": account}
		_, _ = mongo.ArchivedJobStats.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountTimelineMonths.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.ProductionTotals.Collection().DeleteMany(cctx, scope)
		_, _ = mongo.AccountRebuildQueue.Collection().DeleteMany(cctx, bson.M{"_id": owner.Key()})
	}
	clean()
	t.Cleanup(clean)

	now := time.Now().UTC()
	job := models.Job{
		JobID:               "job-prune-1",
		ItemID:              4321,
		JobType:             1,
		ItemsProducedPerRun: 5,
		Build: models.JobBuild{
			Setup: map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}},
			Costs: models.JobCosts{LinkedJobs: []models.LinkedESIJob{{JobID: 2, Cost: 750}}},
		},
	}
	job.MetaData.AccountID = account
	job.MetaData.ArchivedAt = now

	row, err := archivestats.NewRow(job, now)
	if err != nil {
		t.Fatalf("NewRow: %v", err)
	}
	if err := mongo.WriteStatsRows(ctx, []models.ArchivedJobStats{row}, 100); err != nil {
		t.Fatalf("WriteStatsRows: %v", err)
	}

	fold := func(t *testing.T) {
		t.Helper()
		if err := mongo.QueueOwnerWork(ctx, owner, eipmongo.StatsWorkDelta, now); err != nil {
			t.Fatalf("queue: %v", err)
		}
		queued, lerr := mongo.ListQueuedOwners(ctx, time.Time{})
		if lerr != nil {
			t.Fatalf("ListQueuedOwners: %v", lerr)
		}
		for _, q := range queued {
			if q.Owner.ID != account {
				continue
			}
			if _, _, aerr := applyOwnerDelta(ctx, mongo, q, now); aerr != nil {
				t.Fatalf("applyOwnerDelta: %v", aerr)
			}
			return
		}
		t.Fatal("the owner was not queued")
	}

	fold(t)
	totals, err := mongo.LoadProductionTotals(ctx, models.AccountOwner(account), 4321)
	if err != nil {
		t.Fatalf("read totals: %v", err)
	}
	if len(totals) != 1 {
		t.Fatalf("after archiving, totals = %d rows, want 1", len(totals))
	}

	// Restored: the only job of this type is gone.
	if _, err := mongo.RevokeStatsRowsForJobs(ctx, models.AccountOwner(account), []string{job.JobID}, now); err != nil {
		t.Fatalf("RevokeStatsRowsForJobs: %v", err)
	}
	fold(t)

	totals, err = mongo.LoadProductionTotals(ctx, models.AccountOwner(account), 4321)
	if err != nil {
		t.Fatalf("read totals after restore: %v", err)
	}
	if len(totals) != 0 {
		t.Fatalf("the type's totals survived the restore as %+v", totals[0])
	}
	buckets, err := mongo.LoadTimelineMonths(ctx, models.AccountOwner(account))
	if err != nil {
		t.Fatalf("read buckets after restore: %v", err)
	}
	if len(buckets) != 0 {
		t.Fatalf("%d timeline buckets survived the restore", len(buckets))
	}
}
