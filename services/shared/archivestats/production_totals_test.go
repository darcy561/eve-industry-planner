package archivestats

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func jobRow(jobID string, typeID int, buildCosts, produced float64) models.ArchivedJobStats {
	return models.ArchivedJobStats{
		ID:                "acct-1|" + jobID,
		AccountID:         "acct-1",
		JobID:             jobID,
		TypeID:            typeID,
		JobType:           1,
		TotalMaterialCost: buildCosts,
		TotalProduced:     produced,
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

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{row})
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

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{jobRow("job-1", 34, 1000, 10)})
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

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{live, dead})
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

	totals := AccountProductionTotals("acct-1", rows)
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
	sold := withSale(jobRow("job-3", 34, 300, 3), 900, 0, 3)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{chain, retained, sold})
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

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{unsold})
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

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{contract})
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

// Listing output on the market is market activity before anything sells. Sent to
// stock, such a job would report a broker fee total in a block that suppresses
// the fee row explaining where it came from.
func TestBrokerFeeAloneCountsAsMarket(t *testing.T) {
	t.Parallel()

	listed := withFee(jobRow("job-1", 34, 1000, 10), 25)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{listed})
	b := totals[0].Breakdown

	if b.StandaloneRecordedSale.TotalJobs != 1 {
		t.Fatalf("market holds %d jobs, want the listed build", b.StandaloneRecordedSale.TotalJobs)
	}
	if b.RetainedStock.TotalJobs != 0 {
		t.Fatalf("stock holds %d jobs, want 0 — a broker fee is market activity", b.RetainedStock.TotalJobs)
	}
	if b.StandaloneRecordedSale.BrokersFeeTotal != 25 {
		t.Fatalf("market brokersFeeTotal = %v, want 25", b.StandaloneRecordedSale.BrokersFeeTotal)
	}
	// Listed but unsold: the fee is real, the sale is not.
	if b.StandaloneRecordedSale.SalesTotal != 0 {
		t.Fatalf("market salesTotal = %v, want 0", b.StandaloneRecordedSale.SalesTotal)
	}
}

// A line carrying neither money nor goods records nothing, so it cannot be the
// evidence that decides a job met the market.
func TestZeroValuedLinesAreNotMarketEvidence(t *testing.T) {
	t.Parallel()

	placeholder := withFee(withSale(jobRow("job-1", 34, 1000, 10), 0, 0, 0), 0)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{placeholder})
	b := totals[0].Breakdown

	if b.StandaloneRecordedSale.TotalJobs != 0 {
		t.Fatalf("market holds %d jobs, want 0 — the lines carry nothing", b.StandaloneRecordedSale.TotalJobs)
	}
	if b.RetainedStock.TotalJobs != 1 {
		t.Fatalf("stock holds %d jobs, want the job with empty lines", b.RetainedStock.TotalJobs)
	}
}

// Stock is the absence of a sale, not a claim about where the output went.
// A job that sold part of its run met the market, so the whole job counts as a
// sale — how much of it is still held is a quantity, not a segment.
func TestAPartialSaleIsStillASale(t *testing.T) {
	t.Parallel()

	partial := withSale(jobRow("job-1", 34, 1000, 10), 2000, 0, 4)

	totals := AccountProductionTotals("acct-1", []models.ArchivedJobStats{partial})
	b := totals[0].Breakdown

	if b.StandaloneRecordedSale.TotalJobs != 1 {
		t.Fatalf("market holds %d jobs, want the job that recorded a sale", b.StandaloneRecordedSale.TotalJobs)
	}
	if b.RetainedStock.TotalJobs != 0 {
		t.Fatalf("stock holds %d jobs, want 0 — a partial sale is still a sale", b.RetainedStock.TotalJobs)
	}
	if b.StandaloneRecordedSale.TotalSoldQuantity != 4 {
		t.Fatalf("sold quantity = %v, want the 4 units the line records", b.StandaloneRecordedSale.TotalSoldQuantity)
	}
}

func TestNoRowsProducesNoTotals(t *testing.T) {
	t.Parallel()

	if got := AccountProductionTotals("acct-1", nil); got != nil {
		t.Fatalf("got %d totals for an account with no rows, want none", len(got))
	}
	if got := AccountProductionTotals("", []models.ArchivedJobStats{jobRow("job-1", 34, 1, 1)}); got != nil {
		t.Fatal("an empty accountID must produce nothing rather than documents keyed on an empty account")
	}
}

// Invention is part of what a job cost, and the component most easily left out:
// it is neither per unit nor a fee.
func TestInventionIsCountedInAJobsCost(t *testing.T) {
	t.Parallel()

	row := models.ArchivedJobStats{
		TypeID:             587,
		TotalProduced:      10,
		TotalMaterialCost:  100,
		TotalInventionCost: 7,
		TransactionLines: []models.ArchivedJobTransactionLine{
			{Amount: 200, Tax: 3},
		},
		FeeLines: []models.ArchivedJobFeeLine{{Amount: 2}},
	}

	measures := JobMeasures(row)

	// Building it cost 100 in materials and 7 to invent the blueprint.
	if measures.BuildCostTotal != 107 {
		t.Fatalf("buildCostTotal = %v, want 107 — inventing the blueprint is part of building it", measures.BuildCostTotal)
	}
	// 107 to build + 2 brokers + 3 tax
	if measures.JobCostTotal != 112 {
		t.Fatalf("jobCostTotal = %v, want 112", measures.JobCostTotal)
	}
	if measures.ProfitLoss != 88 {
		t.Fatalf("profitLoss = %v, want 200 - 112", measures.ProfitLoss)
	}
}
