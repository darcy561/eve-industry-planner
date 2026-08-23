package archivestats

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func jobRow(jobID string, typeID int, buildCosts, produced float64) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		ID:              "acct-1|" + jobID,
		AccountID:       "acct-1",
		JobID:           jobID,
		TypeID:          typeID,
		JobType:         1,
		TotalBuildCosts: buildCosts,
		TotalProduced:   produced,
	}
}

func withSale(row models.ArchivedJobStats, amount, tax, quantity float64) models.ArchivedJobStats {
	row.TransactionLines = append(row.TransactionLines, models.ArchivedJobTransactionLine{
		Quantity: quantity,
		Tax:      tax,
		Amount:   amount,
	})
	return row
}

func withFee(row models.ArchivedJobStats, amount float64) models.ArchivedJobStats {
	row.FeeLines = append(row.FeeLines, models.ArchivedJobFeeLine{
		Amount: amount,
	})
	return row
}

// jobCostTotal carries build costs plus both fee totals, and profitLoss is
// sales minus that. The fees are therefore already inside jobCostTotal and must
// not be subtracted again — the shape a caller is most likely to restate wrongly.
func TestJobCostTotalIncludesFeesAndProfitSubtractsThemOnce(t *testing.T) {
	t.Parallel()

	row := withFee(withSale(jobRow("job-1", 34, 1000, 10), 2000, 50, 10), 30)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{row}, nil)
	if len(totals) != 1 {
		t.Fatalf("got %d totals, want 1", len(totals))
	}
	got := totals[0]

	if got.BuildCostTotal != 1000 {
		t.Fatalf("buildCostTotal = %v, want 1000", got.BuildCostTotal)
	}
	if got.BrokersFeeTotal != 30 || got.TransactionFeeTotal != 50 {
		t.Fatalf("fees = %v/%v, want 30/50", got.BrokersFeeTotal, got.TransactionFeeTotal)
	}
	if got.JobCostTotal != 1080 {
		t.Fatalf("jobCostTotal = %v, want 1080 (build costs plus both fees)", got.JobCostTotal)
	}
	if got.ProfitLoss != 920 {
		t.Fatalf("profitLoss = %v, want 920 (2000 − 1080); subtracting the fees twice would give 840", got.ProfitLoss)
	}
}

// An unsold build has not lost money, it has not realised any. Reporting a
// negative equal to its build cost would read as a loss the user never took.
func TestUnsoldJobHasZeroProfitNotNegative(t *testing.T) {
	t.Parallel()

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{jobRow("job-1", 34, 1000, 10)}, nil)
	if len(totals) != 1 {
		t.Fatalf("got %d totals, want 1", len(totals))
	}
	if totals[0].ProfitLoss != 0 {
		t.Fatalf("profitLoss = %v, want 0 for a build with no sales", totals[0].ProfitLoss)
	}
	if totals[0].BuildCostTotal != 1000 {
		t.Fatal("the build cost is still recorded even though nothing sold")
	}
}

// A revoked row describes a job that is no longer archived. Counting it would
// keep a removed job in the account's lifetime figures forever.
func TestRevokedRowsAreExcludedFromTotals(t *testing.T) {
	t.Parallel()

	live := withSale(jobRow("job-1", 34, 1000, 10), 2000, 0, 10)
	dead := withSale(jobRow("job-2", 34, 500, 5), 900, 0, 5)
	dead.Revoked = true

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{live, dead}, nil)
	if len(totals) != 1 {
		t.Fatalf("got %d totals, want 1", len(totals))
	}
	if totals[0].TotalJobs != 1 {
		t.Fatalf("totalJobs = %d, want 1 — the revoked job was counted", totals[0].TotalJobs)
	}
	if totals[0].SalesTotal != 2000 {
		t.Fatalf("salesTotal = %v, want 2000", totals[0].SalesTotal)
	}
}

func TestTotalsGroupByItemType(t *testing.T) {
	t.Parallel()

	rows := []models.ArchivedJobStats{
		withSale(jobRow("job-1", 34, 100, 1), 500, 0, 1),
		withSale(jobRow("job-2", 34, 100, 1), 500, 0, 1),
		withSale(jobRow("job-3", 35, 200, 1), 900, 0, 1),
	}

	totals := AccountProductionTotals("acct-1", rows, nil)
	if len(totals) != 2 {
		t.Fatalf("got %d totals, want one per item type", len(totals))
	}
	// Sorted by typeID, so a rebuild writes the same documents in the same order.
	if totals[0].TypeID != 34 || totals[1].TypeID != 35 {
		t.Fatalf("types = %d, %d; want 34 then 35", totals[0].TypeID, totals[1].TypeID)
	}
	if totals[0].TotalJobs != 2 || totals[1].TotalJobs != 1 {
		t.Fatalf("totalJobs = %d, %d; want 2 and 1", totals[0].TotalJobs, totals[1].TotalJobs)
	}
	if totals[0].SalesTotal != 1000 {
		t.Fatalf("type 34 salesTotal = %v, want 1000", totals[0].SalesTotal)
	}
}

// A job belongs to exactly one segment. Crediting two would count the same job
// twice inside one document, so the totals and the breakdown would disagree.
func TestBreakdownCreditsEachJobToOneSegment(t *testing.T) {
	t.Parallel()

	chain := withSale(jobRow("job-1", 34, 100, 1), 400, 0, 1)
	chain.IsProductionChain = true
	retained := jobRow("job-2", 34, 200, 2)
	retained.RetainedStockBuild = true
	sold := withSale(jobRow("job-3", 34, 300, 3), 900, 0, 3)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{chain, retained, sold}, nil)
	if len(totals) != 1 {
		t.Fatalf("got %d totals, want 1", len(totals))
	}
	b := totals[0].Breakdown

	if b.ProductionChain.TotalJobs != 1 || b.RetainedStock.TotalJobs != 1 || b.StandaloneRecordedSale.TotalJobs != 1 {
		t.Fatalf("segments = %d/%d/%d, want one job each",
			b.ProductionChain.TotalJobs, b.RetainedStock.TotalJobs, b.StandaloneRecordedSale.TotalJobs)
	}
	segmentJobs := b.ProductionChain.TotalJobs + b.RetainedStock.TotalJobs + b.StandaloneRecordedSale.TotalJobs
	if segmentJobs != totals[0].TotalJobs {
		t.Fatalf("segments hold %d jobs but the row totals %d — a job was credited twice or not at all", segmentJobs, totals[0].TotalJobs)
	}
	// A retained build is classified as retained even though it is unsold, which
	// is the case the production-chain check must not swallow.
	if b.RetainedStock.TotalSoldQuantity != 0 {
		t.Fatalf("retained stock sold %v, want 0", b.RetainedStock.TotalSoldQuantity)
	}
	if b.StandaloneRecordedSale.TotalSoldQuantity != 3 {
		t.Fatalf("standalone sold %v, want 3", b.StandaloneRecordedSale.TotalSoldQuantity)
	}
}

// An unsold build is stock, not a sale that earned nothing. Classifying by
// elimination put every such job under Market showing zero sales against real
// build costs, which reads as a sale that somehow returned nothing.
func TestUnsoldBuildIsStockRatherThanMarket(t *testing.T) {
	t.Parallel()

	unsold := jobRow("job-1", 34, 228_579_115.40, 200)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{unsold}, nil)
	b := totals[0].Breakdown

	if b.StandaloneRecordedSale.TotalJobs != 0 {
		t.Fatalf("market holds %d jobs, want 0 — nothing recorded a sale", b.StandaloneRecordedSale.TotalJobs)
	}
	if b.RetainedStock.TotalJobs != 1 {
		t.Fatalf("stock holds %d jobs, want the unsold build", b.RetainedStock.TotalJobs)
	}
	if b.RetainedStock.JobCostTotal != 228_579_115.40 {
		t.Fatalf("stock jobCostTotal = %v, want the build cost to follow the job", b.RetainedStock.JobCostTotal)
	}
}

// A contract sale is entered by hand as a custom transaction carrying the same
// quantity, amount and tax as an ESI one, and reaches the pipeline as an ordinary
// transaction line. Market must count it: the segment asks whether a sale was
// recorded, not where the record came from.
func TestSaleRecordedByHandCountsAsMarket(t *testing.T) {
	t.Parallel()

	// A custom transaction is distinguished only by a negative id.
	contract := jobRow("job-1", 34, 1000, 10)
	contract.TransactionLines = append(contract.TransactionLines, models.ArchivedJobTransactionLine{
		TransactionID: -1_700_000_000_000_123,
		Quantity:      10,
		Tax:           30,
		Amount:        2000,
	})

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{contract}, nil)
	b := totals[0].Breakdown

	if b.StandaloneRecordedSale.TotalJobs != 1 {
		t.Fatalf("market holds %d jobs, want the hand-entered sale", b.StandaloneRecordedSale.TotalJobs)
	}
	if b.RetainedStock.TotalJobs != 0 {
		t.Fatalf("stock holds %d jobs, want 0 — the job sold", b.RetainedStock.TotalJobs)
	}
	if b.StandaloneRecordedSale.SalesTotal != 2000 {
		t.Fatalf("market salesTotal = %v, want 2000", b.StandaloneRecordedSale.SalesTotal)
	}
	if b.StandaloneRecordedSale.TransactionFeeTotal != 30 {
		t.Fatalf("market transactionFeeTotal = %v, want the tax on the custom line", b.StandaloneRecordedSale.TransactionFeeTotal)
	}
}

// The flag is a user's statement about their own output, so it outranks the
// sale evidence: a job marked as kept stays stock even if a line was recorded
// against it.
func TestRetainedFlagOutranksRecordedSale(t *testing.T) {
	t.Parallel()

	flagged := withSale(jobRow("job-1", 34, 1000, 10), 2000, 0, 10)
	flagged.RetainedStockBuild = true

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{flagged}, nil)
	b := totals[0].Breakdown

	if b.RetainedStock.TotalJobs != 1 {
		t.Fatalf("stock holds %d jobs, want the flagged build", b.RetainedStock.TotalJobs)
	}
	if b.StandaloneRecordedSale.TotalJobs != 0 {
		t.Fatalf("market holds %d jobs, want 0 — the user marked this as kept", b.StandaloneRecordedSale.TotalJobs)
	}
}

// The read returns an empty array for an account with no history, so a rebuilt
// row must carry [] rather than null or the response shape changes.
func TestSnapshotsAreAnEmptyArrayWhenAbsent(t *testing.T) {
	t.Parallel()

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{jobRow("job-1", 34, 100, 1)}, nil)
	if len(totals) != 1 {
		t.Fatalf("got %d totals, want 1", len(totals))
	}
	if totals[0].DataSnapshots == nil {
		t.Fatal("dataSnapshots is nil; it must serialise as [] the way the read does")
	}
	if len(totals[0].DataSnapshots) != 0 {
		t.Fatalf("dataSnapshots has %d entries, want none", len(totals[0].DataSnapshots))
	}
}

func TestSnapshotsAreAttachedAndOrdered(t *testing.T) {
	t.Parallel()

	rows := []models.ArchivedJobStats{
		jobRow("job-1", 34, 100, 1),
		jobRow("job-2", 34, 100, 1),
	}
	snapshots := map[string]models.BuildStatSnapshot{
		"job-1": {JobID: "job-1", TypeID: 34, ProcessDate: 200},
		"job-2": {JobID: "job-2", TypeID: 34, ProcessDate: 100},
	}

	totals := AccountProductionTotals("acct-1", rows, snapshots)
	got := totals[0].DataSnapshots
	if len(got) != 2 {
		t.Fatalf("got %d snapshots, want 2", len(got))
	}
	if got[0].JobID != "job-2" || got[1].JobID != "job-1" {
		t.Fatalf("snapshots ordered %s, %s; want oldest first so a rebuild is reproducible", got[0].JobID, got[1].JobID)
	}
}

func TestNoRowsProducesNoTotals(t *testing.T) {
	t.Parallel()

	if got := AccountProductionTotals("acct-1", nil, nil); got != nil {
		t.Fatalf("got %d totals for an account with no rows, want none", len(got))
	}
	if got := AccountProductionTotals("", []models.ArchivedJobStats{jobRow("job-1", 34, 1, 1)}, nil); got != nil {
		t.Fatal("an empty accountID must produce nothing rather than documents keyed on an empty account")
	}
}
