package archivestats

import (
	"testing"

	"eve-industry-planner/shared/models"
)

// Repeated $inc and a single summation do not produce identical float64s from
// the same inputs, so a residue at that scale is arithmetic and not drift.
func TestMoneyMatchesIgnoresAFloatResidue(t *testing.T) {
	t.Parallel()

	var summed float64
	for range 1000 {
		summed += 0.1
	}
	if !MoneyMatches(summed, 100) {
		t.Fatalf("summed %.17g reported as drift against 100", summed)
	}
	if !MoneyMatches(2_099_929_529_506.13, 2_099_929_529_506.1301) {
		t.Fatal("a trailing-digit difference on a trillion-ISK figure is not drift")
	}
	if MoneyMatches(1000, 1001) {
		t.Fatal("a whole ISK apart on a small figure is drift")
	}
	if MoneyMatches(0, 1) {
		t.Fatal("something against nothing is drift")
	}
}

func bucket(id string, rows int64, sales float64) models.TimelineMonthBucket {
	return models.TimelineMonthBucket{
		ID:               id,
		ContributingRows: rows,
		SalesTotal:       sales,
	}
}

// Counts are integers, so a mismatch is unambiguously a bug rather than
// arithmetic. That is what makes them the primary signal.
func TestCompareBucketsReportsACountMismatch(t *testing.T) {
	t.Parallel()

	stored := []models.TimelineMonthBucket{bucket("a", 2, 1000)}
	folded := []models.TimelineMonthBucket{bucket("a", 3, 1000)}

	drift := CompareBuckets(stored, folded)
	if drift.CountsOff != 1 {
		t.Fatalf("CountsOff = %d, want 1", drift.CountsOff)
	}
	if drift.MoneyOff != 0 {
		t.Fatalf("MoneyOff = %d, want 0 — the money agreed", drift.MoneyOff)
	}
	if !drift.Any() {
		t.Fatal("a count mismatch is drift")
	}
}

func TestCompareBucketsSeparatesMissingFromExtra(t *testing.T) {
	t.Parallel()

	stored := []models.TimelineMonthBucket{bucket("a", 1, 10), bucket("orphan", 1, 10)}
	folded := []models.TimelineMonthBucket{bucket("a", 1, 10), bucket("new", 1, 10)}

	drift := CompareBuckets(stored, folded)
	if drift.Missing != 1 {
		t.Fatalf("Missing = %d, want 1 (folded but not stored)", drift.Missing)
	}
	if drift.Extra != 1 {
		t.Fatalf("Extra = %d, want 1 (stored but nothing contributes to it)", drift.Extra)
	}
}

// A reconcile that found nothing wrong must say so, or every owner reports drift
// and the signal means nothing.
func TestCompareBucketsReportsNoDriftWhenTheyAgree(t *testing.T) {
	t.Parallel()

	same := []models.TimelineMonthBucket{bucket("a", 2, 1000), bucket("b", 5, 250.75)}

	if drift := CompareBuckets(same, same); drift.Any() {
		t.Fatalf("identical documents reported drift: %+v", drift)
	}
}

func TestCompareTotalsRecordsTheWidestGap(t *testing.T) {
	t.Parallel()

	stored := []models.ProductionTotalsRow{
		{ID: "a", SalesTotal: 100, JobCostTotal: 5000},
	}
	folded := []models.ProductionTotalsRow{
		{ID: "a", SalesTotal: 150, JobCostTotal: 9000},
	}

	drift := CompareTotals(stored, folded)
	if drift.MoneyOff != 1 {
		t.Fatalf("MoneyOff = %d, want 1", drift.MoneyOff)
	}
	if drift.Field != "jobCostTotal" {
		t.Fatalf("Field = %q, want the measure with the widest gap", drift.Field)
	}
	if drift.WorstGap != 4000 {
		t.Fatalf("WorstGap = %v, want 4000", drift.WorstGap)
	}
}
