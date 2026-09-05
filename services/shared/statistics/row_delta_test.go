package statistics

import (
	"math"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

// The property the incremental path rests on: applying every row's contribution
// one at a time reaches the same buckets a wholesale fold of all of them does.
// If this drifts, a delta-built document and a rebuilt one disagree.
func TestSummedContributionsEqualAWholesaleFold(t *testing.T) {
	t.Parallel()

	rows := []models.ArchivedJobStats{
		func() models.ArchivedJobStats {
			r := statsRow(34, month(2026, 3))
			r.TotalProduced = 4
			r.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 4), 4, 1000, 50)}
			r.FeeLines = []models.ArchivedJobFeeLine{feeLine(month(2026, 4), 25)}
			return r
		}(),
		func() models.ArchivedJobStats {
			r := statsRow(34, month(2026, 3))
			r.TotalProduced = 2
			r.IsProductionChain = true
			return r
		}(),
		func() models.ArchivedJobStats {
			r := statsRow(35, month(2026, 5))
			r.TotalProduced = 7
			r.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 5), 7, 900, 45)}
			return r
		}(),
	}

	wholesale := AccumulateBuckets(rows)

	summed := map[models.StatsBucketKey]models.StatsBucketDelta{}
	for _, row := range rows {
		for key, bucket := range ContributionOf(row).Buckets {
			held := summed[key]
			held.Measures = held.Measures.Plus(bucket.Measures)
			held.Rows += bucket.Rows
			summed[key] = held
		}
	}

	if len(summed) != len(wholesale) {
		t.Fatalf("summed %d buckets, wholesale produced %d", len(summed), len(wholesale))
	}
	for key, want := range wholesale {
		got := summed[key]
		if !measuresClose(got.Measures, want.Measures) {
			t.Errorf("bucket %+v:\n got  %+v\n want %+v", key, got.Measures, want.Measures)
		}
		// The count has to agree too: it is what decides whether a bucket still
		// has contributors, so a delta that adds one and a fold that counts
		// another leaves a bucket that outlives its rows or dies before them.
		if got.Rows != want.Rows {
			t.Errorf("bucket %+v: summed %d rows, wholesale counted %d", key, got.Rows, want.Rows)
		}
	}
}

// Removing a contribution has to leave exactly what was there before it, or a
// restore drifts the figures it was meant to correct.
func TestApplyingThenNegatingLeavesNothing(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 3))
	row.TotalProduced = 4
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 3), 4, 1000, 50)}

	delta := ContributionOf(row)
	undo := delta.Negated()

	for key, bucket := range delta.Buckets {
		undone := undo.Buckets[key]
		net := bucket.Measures.Plus(undone.Measures)
		if !measuresClose(net, models.SalesMeasures{}) {
			t.Errorf("bucket %+v did not return to zero: %+v", key, net)
		}
		if bucket.Rows+undone.Rows != 0 {
			t.Errorf("bucket %+v row count did not return to zero", key)
		}
	}
	for key, total := range delta.Totals {
		net := total.Measures.Plus(undo.Totals[key].Measures)
		if net != (models.BuildMeasures{}) {
			t.Errorf("%+v totals did not return to zero: %+v", key, net)
		}
		// The job count is what decides whether the row still has anything behind
		// it, so it has to come back to zero exactly rather than nearly.
		if total.Measures.TotalJobs+undo.Totals[key].Measures.TotalJobs != 0 {
			t.Errorf("%+v job count did not return to zero", key)
		}
	}
}

// A revoked row describes a job that is no longer archived, so it contributes
// nothing — the same answer the folds give.
func TestRevokedRowContributesNothing(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 3))
	row.TotalProduced = 4
	row.Revoked = true

	if got := ContributionOf(row); !got.IsZero() {
		t.Fatalf("revoked row contributed %+v", got)
	}
}

func TestContributionCarriesTheSegmentTheTotalsCountItUnder(t *testing.T) {
	t.Parallel()

	chain := statsRow(34, month(2026, 3))
	chain.TotalProduced = 1
	chain.IsProductionChain = true

	key := models.StatsTypeKey{TypeID: 34, Segment: models.ArchiveSegmentProductionChain}
	if _, credited := ContributionOf(chain).Totals[key]; !credited {
		t.Fatalf("chain build was not credited under %q", key.Segment)
	}
}

// Money is summed as float64, so equality after a round trip needs a tolerance;
// counts are integers and compare exactly.
func measuresClose(a, b models.SalesMeasures) bool {
	if a.TransactionCount != b.TransactionCount {
		return false
	}
	for _, pair := range [][2]float64{
		{a.QuantitySold, b.QuantitySold},
		{a.SalesTotal, b.SalesTotal},
		{a.QuantityProduced, b.QuantityProduced},
		{a.JobCostTotal, b.JobCostTotal},
		{a.MaterialCostTotal, b.MaterialCostTotal},
		{a.InventionCostTotal, b.InventionCostTotal},
		{a.InstallCostTotal, b.InstallCostTotal},
		{a.ExtrasTotal, b.ExtrasTotal},
		{a.TransactionFeeTotal, b.TransactionFeeTotal},
		{a.BrokersFeeTotal, b.BrokersFeeTotal},
		{a.ProfitLoss, b.ProfitLoss},
	} {
		if math.Abs(pair[0]-pair[1]) > 1e-6 {
			return false
		}
	}
	for category, value := range b.ExtraCategoryTotals {
		if math.Abs(a.ExtraCategoryTotals[category]-value) > 1e-6 {
			return false
		}
	}
	return true
}

// Rows of one type can sit in different segments, so a contribution keyed on type
// alone would credit only whichever was folded last.
func TestRowsOfOneTypeInDifferentSegmentsAreCreditedSeparately(t *testing.T) {
	t.Parallel()

	chain := statsRow(34, month(2026, 3))
	chain.TotalProduced = 1
	chain.IsProductionChain = true

	sold := statsRow(34, month(2026, 3))
	sold.TotalProduced = 1
	sold.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 3), 1, 500, 25)}

	merged := map[models.StatsTypeKey]models.StatsTypeDelta{}
	for _, row := range []models.ArchivedJobStats{chain, sold} {
		for key, total := range ContributionOf(row).Totals {
			held := merged[key]
			held.Measures = held.Measures.Plus(total.Measures)
			merged[key] = held
		}
	}

	if len(merged) != 2 {
		t.Fatalf("got %d credits, want one per segment: %+v", len(merged), merged)
	}
	for _, key := range []models.StatsTypeKey{
		{TypeID: 34, Segment: models.ArchiveSegmentProductionChain},
		{TypeID: 34, Segment: models.ArchiveSegmentStandaloneRecordedSale},
	} {
		if merged[key].Measures.TotalJobs != 1 {
			t.Errorf("%+v has %d jobs, want 1", key, merged[key].Measures.TotalJobs)
		}
	}
}

// A row says nothing about whether its figures are counted, because the job it
// came from does not know. A caller that only creates the row must leave it
// outstanding, or the fold that exists to find new rows would skip every one.
func TestABuiltRowIsUncountedUntilAWriterSaysOtherwise(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 31, 12, 0, 0, 0, time.UTC)
	row := RowFromFigures(models.Job{
		JobID:               "job-1",
		ItemID:              34,
		ItemsProducedPerRun: 4,
		Build: models.JobBuild{
			Setup: map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}},
		},
	}, models.JobFigures{TotalProduced: 4}, now)

	if row.ContributedAt != nil {
		t.Fatal("a freshly built row claims to be counted; a new job's figures would never be folded in")
	}
	if !row.AwaitsContribution() {
		t.Fatal("a freshly built row is not offered as outstanding work")
	}
}
