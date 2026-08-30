package statistics

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func rowWith(typeID int, chainCost, stockCost, saleCost float64) models.ProductionTotalsRow {
	row := models.ProductionTotalsRow{TypeID: typeID, JobType: 1}
	row.Breakdown.ProductionChain.JobCostTotal = chainCost
	row.Breakdown.RetainedStock.JobCostTotal = stockCost
	row.Breakdown.StandaloneRecordedSale.JobCostTotal = saleCost
	row.JobCostTotal = chainCost + stockCost + saleCost
	row.DataSnapshots = []models.BuildStatSnapshot{{JobID: "job-1"}}
	return row
}

// A view describing the whole archive needs the segments summed across types,
// which is the read the segment split could not make for itself.
func TestFoldTotalsSumsEverySegmentAcrossTypes(t *testing.T) {
	t.Parallel()

	total := foldTotals([]models.ProductionTotalsRow{
		rowWith(587, 10, 5, 20),
		rowWith(597, 1, 2, 3),
	})

	if got := total.Breakdown.ProductionChain.JobCostTotal; got != 11 {
		t.Errorf("production chain = %v, want 11", got)
	}
	if got := total.Breakdown.RetainedStock.JobCostTotal; got != 7 {
		t.Errorf("retained stock = %v, want 7", got)
	}
	if got := total.Breakdown.StandaloneRecordedSale.JobCostTotal; got != 23 {
		t.Errorf("standalone recorded sale = %v, want 23", got)
	}
	if got := total.JobCostTotal; got != 41 {
		t.Errorf("jobCostTotal = %v, want 41", got)
	}
}

// The per-job snapshots belong to a single type's history and mean nothing once
// types are summed. Carrying them would also make the summary the largest
// response on the page rather than the smallest.
func TestFoldTotalsDropsPerJobSnapshots(t *testing.T) {
	t.Parallel()

	total := foldTotals([]models.ProductionTotalsRow{rowWith(587, 1, 1, 1)})

	if len(total.DataSnapshots) != 0 {
		t.Fatalf("dataSnapshots = %v, want none", total.DataSnapshots)
	}
	if total.TypeID != 0 {
		t.Fatalf("typeID = %d, want 0: the row is no longer about one type", total.TypeID)
	}
}

// An account with nothing archived gets a zeroed row rather than a nil one, so
// the view renders empty segments instead of failing to read them.
func TestFoldTotalsOfNothingIsZeroed(t *testing.T) {
	t.Parallel()

	total := foldTotals(nil)

	if total.JobCostTotal != 0 || total.Breakdown.ProductionChain.JobCostTotal != 0 {
		t.Fatalf("expected a zeroed row, got %+v", total)
	}
	if total.DataSnapshots == nil {
		t.Fatal("dataSnapshots should serialise as [] rather than null")
	}
}
