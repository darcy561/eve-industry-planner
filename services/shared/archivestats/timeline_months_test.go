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
		// The lump is the sum of its components, as the pipeline writes it.
		TotalMaterialCost:  70,
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

// Each component is counted once. Materials, install and extras make the build
// cost, and invention goes on top of it.
func TestJobCostCountsInstallAndExtrasOnce(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})

	got := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.JobCostTotal != 105 { // 100 build (materials+install+extras) + 5 invention
		t.Fatalf("jobCostTotal = %v, want 105 — each component counted once", got.JobCostTotal)
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

	may := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 5)}]
	if may.JobCostTotal != 105 || may.SalesTotal != 0 {
		t.Fatalf("May = %+v, want costs only", may)
	}

	june := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
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

	got := AccumulateAccountBuckets([]models.ArchivedJobStats{row})[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
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
// Each kind of build gets its own bucket, so a view summing across item types can
// read the direct buckets alone while an item keeps its whole history.
func TestProductionChainIntermediatesGetTheirOwnBucket(t *testing.T) {
	t.Parallel()

	chain := statsRow(34, month(2026, 6))
	chain.IsProductionChain = true
	chain.TotalProduced = 3
	direct := statsRow(34, month(2026, 6))
	direct.TotalProduced = 2

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{chain, direct})

	if len(buckets) != 2 {
		t.Fatalf("want a bucket per kind, got %d: %+v", len(buckets), buckets)
	}
	chainKey := models.StatsBucketKey{TypeID: 34, IsProductionChain: true, CalendarMonth: month(2026, 6)}
	directKey := models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}
	if got := buckets[chainKey].QuantityProduced; got != 3 {
		t.Errorf("chain bucket produced: got %v, want 3", got)
	}
	if got := buckets[directKey].QuantityProduced; got != 2 {
		t.Errorf("direct bucket produced: got %v, want 2", got)
	}
	if buckets[directKey].JobCostTotal == buckets[chainKey].JobCostTotal+buckets[directKey].JobCostTotal {
		t.Error("chain cost was summed into the direct bucket")
	}
}

// An item only ever built as an intermediate still produces buckets, which is the
// history its panel shows.
func TestChainOnlyItemStillProducesBuckets(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 6))
	row.IsProductionChain = true
	row.TotalProduced = 4

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})

	if len(buckets) != 1 {
		t.Fatalf("buckets = %+v, want one", buckets)
	}
	key := models.StatsBucketKey{TypeID: 34, IsProductionChain: true, CalendarMonth: month(2026, 6)}
	if got := buckets[key].QuantityProduced; got != 4 {
		t.Fatalf("chain bucket produced: got %v, want 4", got)
	}
}

func TestChainBucketGetsItsOwnDocumentID(t *testing.T) {
	t.Parallel()

	chain := statsRow(34, month(2026, 6))
	chain.IsProductionChain = true
	direct := statsRow(34, month(2026, 6))

	docs := AccountBuckets("acct-1", []models.ArchivedJobStats{chain, direct})

	if len(docs) != 2 {
		t.Fatalf("want two documents, got %d", len(docs))
	}
	if docs[0].ID != "acct-1|34|2026-06" || docs[0].IsProductionChain {
		t.Errorf("direct bucket: got %q chain=%v", docs[0].ID, docs[0].IsProductionChain)
	}
	if docs[1].ID != "acct-1|34|2026-06|chain" || !docs[1].IsProductionChain {
		t.Errorf("chain bucket: got %q chain=%v", docs[1].ID, docs[1].IsProductionChain)
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

	got := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
	if got.TransactionCount != 2 || got.QuantitySold != 4 || got.SalesTotal != 400 {
		t.Fatalf("combined = %+v", got)
	}
	if got.JobCostTotal != 210 { // both jobs' costs
		t.Fatalf("combined jobCostTotal = %v, want 210", got.JobCostTotal)
	}
}

// Extra-category totals merge across jobs sharing a bucket, and the fold must not
// hand back a map any row still owns.
// Extras follow the job's costs, not its sales. A job archived in one month and
// sold in the next must report its extras against the month the money was spent,
// or a category's monthly spend drifts to whenever the output happened to sell.
func TestExtraCategoryTotalsLandInTheCostMonth(t *testing.T) {
	t.Parallel()

	row := statsRow(34, month(2026, 1))
	row.ExtraCategoryTotals = map[string]float64{"1": 42, "3": 8}
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 2), 5, 900, 10)}

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})

	cost := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 1)}]
	if cost.ExtraCategoryTotals["1"] != 42 || cost.ExtraCategoryTotals["3"] != 8 {
		t.Fatalf("cost month extras = %v, want the job's categories", cost.ExtraCategoryTotals)
	}

	sale := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 2)}]
	if len(sale.ExtraCategoryTotals) != 0 {
		t.Fatalf("sale month extras = %v, want none — the spend happened in January", sale.ExtraCategoryTotals)
	}
}

// Several jobs sharing a month must have their categories summed rather than the
// last one written winning, and a category only one job used must survive.
func TestExtraCategoryTotalsSumAcrossJobsInAMonth(t *testing.T) {
	t.Parallel()

	first := statsRow(34, month(2026, 1))
	first.ExtraCategoryTotals = map[string]float64{"1": 40, "0": 2}
	second := statsRow(34, month(2026, 1))
	second.ExtraCategoryTotals = map[string]float64{"1": 10, "5": 7}

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{first, second})
	got := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 1)}].ExtraCategoryTotals

	if got["1"] != 50 {
		t.Fatalf("shared category = %v, want 50 — both jobs used it", got["1"])
	}
	if got["0"] != 2 || got["5"] != 7 {
		t.Fatalf("extras = %v, want each job's own category kept", got)
	}
}

// A job with no extras must leave the month's map absent rather than empty, so
// the field stays omitted on the wire instead of serialising as {}.
func TestMonthWithoutExtrasCarriesNoCategoryMap(t *testing.T) {
	t.Parallel()

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{statsRow(34, month(2026, 1))})
	got := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 1)}]

	if len(got.ExtraCategoryTotals) != 0 {
		t.Fatalf("extras = %v, want none", got.ExtraCategoryTotals)
	}
}

func TestExtraCategoryTotalsMergeWithoutAliasing(t *testing.T) {
	t.Parallel()

	a := statsRow(34, month(2026, 6))
	a.ExtraCategoryTotals = map[string]float64{"shipping": 10}
	b := statsRow(34, month(2026, 6))
	b.ExtraCategoryTotals = map[string]float64{"shipping": 5, "tax": 2}

	got := AccumulateAccountBuckets([]models.ArchivedJobStats{a, b})[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 6)}]
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
	if _, ok := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}]; !ok {
		t.Fatalf("no March bucket; got %+v", buckets)
	}
}

func TestInvalidCostMonthIsRejected(t *testing.T) {
	t.Parallel()

	row := statsRow(34, models.CalendarMonth{Year: 2026, Month: 13})
	row.ArchivedAt = time.Date(2026, 3, 4, 0, 0, 0, 0, time.UTC)

	if _, ok := AccumulateAccountBuckets([]models.ArchivedJobStats{row})[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}]; !ok {
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

// Each component reaches the bucket, not just their sum.
func TestBucketsCarryTheComponentsOfCost(t *testing.T) {
	t.Parallel()

	doc := models.ArchivedJobStats{
		TypeID:             587,
		CostMonth:          models.CalendarMonth{Year: 2026, Month: 3},
		TotalMaterialCost:  100,
		TotalInstallCost:   10,
		TotalExtras:        5,
		TotalInventionCost: 5,
	}

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{doc, doc})
	got := buckets[models.StatsBucketKey{TypeID: 587, Year: 2026, Month: 3}]

	if got.MaterialCostTotal != 200 {
		t.Errorf("materialCostTotal = %v, want 200", got.MaterialCostTotal)
	}
	if got.InstallCostTotal != 20 {
		t.Errorf("installCostTotal = %v, want 20", got.InstallCostTotal)
	}
	if got.InventionCostTotal != 10 {
		t.Errorf("inventionCostTotal = %v, want 10", got.InventionCostTotal)
	}
	// The components describe the cost; they do not replace it.
	if got.JobCostTotal != 240 {
		t.Errorf("jobCostTotal = %v, want the whole production cost", got.JobCostTotal)
	}
}

// Output is filed with the cost that paid for it, so cost per unit divides two
// figures from the same month even when the sales landed in another.
func TestQuantityProducedLandsInTheCostMonth(t *testing.T) {
	t.Parallel()
	row := statsRow(34, month(2026, 3))
	row.TotalProduced = 4
	row.TransactionLines = []models.ArchivedJobTransactionLine{txLine(month(2026, 4), 4, 1000, 50)}

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{row})

	cost := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}]
	if cost.QuantityProduced != 4 {
		t.Fatalf("cost month quantity: got %v, want 4", cost.QuantityProduced)
	}
	if sales := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 4)}]; sales.QuantityProduced != 0 {
		t.Fatalf("sales month carried produced quantity: got %v, want 0", sales.QuantityProduced)
	}
	if perUnit := cost.JobCostTotal / cost.QuantityProduced; perUnit != 26.25 {
		t.Fatalf("cost per unit: got %v, want 26.25", perUnit)
	}
}

// A revoked row contributes nothing; a chain row contributes to its own bucket,
// so neither reaches the direct bucket's quantity.
func TestQuantityProducedKeepsChainAndRevokedOutOfTheDirectBucket(t *testing.T) {
	t.Parallel()
	chain := statsRow(34, month(2026, 3))
	chain.TotalProduced = 9
	chain.IsProductionChain = true

	revoked := statsRow(34, month(2026, 3))
	revoked.TotalProduced = 7
	revoked.Revoked = true

	kept := statsRow(34, month(2026, 3))
	kept.TotalProduced = 2

	buckets := AccumulateAccountBuckets([]models.ArchivedJobStats{chain, revoked, kept})

	if got := buckets[models.StatsBucketKey{TypeID: 34, CalendarMonth: month(2026, 3)}].QuantityProduced; got != 2 {
		t.Fatalf("quantity produced: got %v, want 2", got)
	}
}

func TestQuantityProducedSumsAcrossPlus(t *testing.T) {
	t.Parallel()
	a := models.SalesMeasures{QuantityProduced: 3}
	b := models.SalesMeasures{QuantityProduced: 4}

	if got := a.Plus(b).QuantityProduced; got != 7 {
		t.Fatalf("Plus dropped quantityProduced: got %v, want 7", got)
	}
}
