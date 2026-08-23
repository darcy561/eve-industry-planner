package archivestats

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

func month(year, m int) models.CalendarMonth {
	return models.CalendarMonth{Year: year, Month: m}
}

func statsRow(typeID int, cost models.CalendarMonth) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		AccountID: "acct-1",
		TypeID:    typeID,
		CostMonth: cost,
		// TotalBuildCosts already covers materials, install and extras.
		TotalBuildCosts:    100,
		TotalInstallCost:   20,
		TotalExtras:        10,
		TotalInventionCost: 5,
	}
}

func txLine(m models.CalendarMonth, qty, amount, tax float64) models.ArchivedJobTransactionLine {
	return models.ArchivedJobTransactionLine{
		CalendarMonth: m, Amount: amount,
		Quantity: qty,
		Tax:      tax,
	}
}

func feeLine(m models.CalendarMonth, amount float64) models.ArchivedJobFeeLine {
	return models.ArchivedJobFeeLine{CalendarMonth: m, Amount: amount}
}

// TotalBuildCosts already includes install and extras, so a bucket must add only
// invention on top. Summing all four would count install and extras twice and
// overstate every month's costs.
func TestJobCostCountsInstallAndExtrasOnce(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})

	got := buckets[BucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.JobCostTotal != 105 { // 100 build (materials+install+extras) + 5 invention
		t.Fatalf("jobCostTotal = %v, want 105 — install and extras are inside TotalBuildCosts", got.JobCostTotal)
	}
	if got.ProfitLoss != -105 {
		t.Fatalf("profitLoss = %v, want -105", got.ProfitLoss)
	}
}

// Sales land in the month they happened; costs land in the job's cost month. A
// build sold the month after it completed therefore touches two buckets.
func TestSalesAndCostsSplitAcrossMonths(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 5))
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 6), 2, 400, 40)}
	row.FeeLines = []models.ArchivedJobFeeLine{feeLine(month(2026, 6), 10)}

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})
	if len(buckets) != 2 {
		t.Fatalf("buckets = %d, want 2 (costs in May, sales in June)", len(buckets))
	}

	may := buckets[BucketKey{TypeID: 34, CalendarMonth: month(2026, 5)}]
	if may.JobCostTotal != 105 || may.SalesTotal != 0 {
		t.Fatalf("May = %+v, want costs only", may)
	}

	june := buckets[BucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if june.SalesTotal != 400 || june.TransactionFeeTotal != 40 || june.BrokersFeeTotal != 10 {
		t.Fatalf("June = %+v, want the sale and its fees", june)
	}
	if june.JobCostTotal != 0 {
		t.Fatalf("June jobCostTotal = %v, want 0", june.JobCostTotal)
	}
	if june.ProfitLoss != 350 { // 400 − 40 tax − 10 broker fee
		t.Fatalf("June profitLoss = %v, want 350", june.ProfitLoss)
	}
	if june.TransactionCount != 1 || june.QuantitySold != 2 {
		t.Fatalf("June counts = %+v", june)
	}
}

// Profit across the whole job is sales less every fee and the build cost.
func TestProfitAcrossBucketsIsSalesLessFeesAndCosts(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 6), 2, 400, 40)}
	row.FeeLines = []models.ArchivedJobFeeLine{feeLine(month(2026, 6), 10)}

	got := AccumulateAccountBuckets([]models.ArchivedJobStats{row})[BucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.ProfitLoss != 245 { // 400 − 40 − 10 − 105
		t.Fatalf("profitLoss = %v, want 245", got.ProfitLoss)
	}
}

// A revoked row describes a job that is no longer archived; it is kept so a
// rebuild can tell removed from never-seen, and must not reach the totals.
func TestRevokedRowsAreExcluded(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	row.Revoked = true
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 6), 2, 400, 40)}

	if got := AccumulateAccountBuckets([]models.ArchivedJobStats{row}); len(got) != 0 {
		t.Fatalf("buckets = %+v, want none", got)
	}
}

// An intermediate's costs are already counted through the parent that consumed
// it, so counting it again would double the build.
func TestProductionChainIntermediatesAreExcluded(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	row.IsProductionChain = true

	if got := AccumulateAccountBuckets([]models.ArchivedJobStats{row}); len(got) != 0 {
		t.Fatalf("buckets = %+v, want none", got)
	}
}

func TestRowsCombineIntoSharedBuckets(t *testing.T) {
	t.Parallel()

	a := statsRow(34, month(2026, 6))
	a.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 6), 1, 100, 10)}
	b := statsRow(34, month(2026, 6))
	b.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 6), 3, 300, 30)}
	other := statsRow(35, month(2026, 6))

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{a, b, other})
	if len(buckets) != 2 {
		t.Fatalf("buckets = %d, want one per item type", len(buckets))
	}

	got := buckets[BucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.TransactionCount != 2 || got.QuantitySold != 4 || got.SalesTotal != 400 {
		t.Fatalf("combined = %+v", got)
	}
	if got.JobCostTotal != 210 { // both jobs' costs
		t.Fatalf("combined jobCostTotal = %v, want 210", got.JobCostTotal)
	}
}

// Extra-category totals merge across jobs sharing a bucket, and the fold must not
// hand back a map any row still owns.
func TestExtraCategoryTotalsMergeWithoutAliasing(t *testing.T) {
	t.Parallel()

	a := statsRow(34, month(2026, 6))
	a.ExtraCategoryTotals = map[string]float64{"shipping": 10}
	b := statsRow(34, month(2026, 6))
	b.ExtraCategoryTotals = map[string]float64{"shipping": 5, "tax": 2}

	got := AccumulateAccountBuckets([]models.ArchivedJobStats{a, b})[BucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.ExtraCategoryTotals["shipping"] != 15 || got.ExtraCategoryTotals["tax"] != 2 {
		t.Fatalf("extras = %v", got.ExtraCategoryTotals)
	}

	got.ExtraCategoryTotals["shipping"] = 999
	if a.ExtraCategoryTotals["shipping"] != 10 {
		t.Fatal("the fold returned a map the source row still owns")
	}
}

// A row written before the cost month was pinned still has to land somewhere.
func TestMissingCostMonthFallsBackToTheArchiveDate(t *testing.T) {
	t.Parallel()

	row := statsRow(34, models.CalendarMonth{})
	row.ArchivedAt = time.Date(2026, 3, 4, 0, 0, 0, 0, time.UTC)

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})
	if _, ok := buckets[BucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}]; !ok {
		t.Fatalf("no March bucket; got %+v", buckets)
	}
}

func TestInvalidCostMonthIsRejected(t *testing.T) {
	t.Parallel()

	row := statsRow(34, models.CalendarMonth{Year: 2026, Month: 13})
	row.ArchivedAt = time.Date(2026, 3, 4, 0, 0, 0, 0, time.UTC)

	if _, ok := AccumulateAccountBuckets([]models.ArchivedJobStats{row})[BucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}]; !ok {
		t.Fatal("a month outside 1-12 must fall back rather than create a thirteenth month")
	}
}

// Documents carry the id the Mongo layer builds and come out in a stable order,
// so a rebuild writes the same documents in the same sequence.
func TestAccountBucketsAreIdentifiedAndOrdered(t *testing.T) {
	t.Parallel()

	rows := []models.ArchivedJobStats{
		statsRow(35, month(2026, 6)),
		statsRow(34, month(2026, 6)),
		statsRow(34, month(2026, 1)),
	}

	buckets := AccountBuckets("acct-1", rows)
	if len(buckets) != 3 {
		t.Fatalf("buckets = %d, want 3", len(buckets))
	}
	want := []string{"acct-1|34|2026-01", "acct-1|34|2026-06", "acct-1|35|2026-06"}
	for i, id := range want {
		if buckets[i].ID != id {
			t.Fatalf("bucket %d id = %q, want %q", i, buckets[i].ID, id)
		}
		if buckets[i].AccountID != "acct-1" {
			t.Fatalf("bucket %d accountID = %q", i, buckets[i].AccountID)
		}
	}
	if AccountBuckets("acct-1", nil) != nil {
		t.Fatal("no rows must produce no buckets")
	}
}
