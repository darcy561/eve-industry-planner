package archivestats

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

var buildNow = time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)

func sampleJob() models.Job {
	job := models.Job{JobID: "job-1", ItemID: 34, JobType: 1}
	job.MetaData.AccountID = "acct-1"
	job.MetaData.ArchivedAt = time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	job.Build.Sale.Transactions = []models.Transaction{
		{TransactionID: 1, OrderID: 900, Quantity: 4, Amount: 400, Tax: 40, Date: "2026-06-01T00:00:00Z"},
	}
	job.Build.Sale.MarketOrders = []models.MarketOrder{{OrderID: 900}}
	job.Build.Sale.BrokersFee = []models.BrokerFee{{ID: 7, OrderID: 900, Amount: 5, Date: "2026-06-02T00:00:00Z"}}
	return job
}

func sampleSnap() models.BuildStatSnapshot {
	return models.BuildStatSnapshot{TotalProduced: 10, TotalJobCost: 500, TotalBuildCosts: 500}
}

// Cost per item prorates the job's cost across what actually sold, and profit is
// net of both tax and that share.
func TestTransactionLinesProrateCostAndProfit(t *testing.T) {
	t.Parallel()

	doc := BuildAccountSnapshot(sampleJob(), sampleSnap(), buildNow)
	if len(doc.TransactionLines) != 1 {
		t.Fatalf("lines = %d, want 1", len(doc.TransactionLines))
	}
	line := doc.TransactionLines[0]

	if line.ProratedCost != 200 { // 4 sold × (500 / 10 produced)
		t.Fatalf("proratedCost = %v, want 200", line.ProratedCost)
	}
	if line.Profit != 160 { // 400 amount − 40 tax − 200 cost
		t.Fatalf("profit = %v, want 160", line.Profit)
	}
	if line.Year != 2026 || line.Month != 6 {
		t.Fatalf("line month = %d-%d, want 2026-6", line.Year, line.Month)
	}
}

// Produced but unsold output is carried with its share of the cost, so the
// aggregates can tell stock apart from loss.
func TestUnsoldQuantityAndCost(t *testing.T) {
	t.Parallel()

	doc := BuildAccountSnapshot(sampleJob(), sampleSnap(), buildNow)
	if doc.UnsoldQuantity != 6 { // 10 produced − 4 sold
		t.Fatalf("unsoldQuantity = %v, want 6", doc.UnsoldQuantity)
	}
	if doc.UnsoldCost != 300 { // 6 × 50
		t.Fatalf("unsoldCost = %v, want 300", doc.UnsoldCost)
	}
}

// Selling more than the snapshot recorded as produced must not report negative
// stock, which would subtract from the account's totals.
func TestOversoldJobDoesNotReportNegativeUnsold(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.Transactions[0].Quantity = 25
	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)

	if doc.UnsoldQuantity != 0 {
		t.Fatalf("unsoldQuantity = %v, want 0", doc.UnsoldQuantity)
	}
	if doc.UnsoldCost != 0 {
		t.Fatalf("unsoldCost = %v, want 0", doc.UnsoldCost)
	}
}

func TestZeroProducedDoesNotDivideByZero(t *testing.T) {
	t.Parallel()

	doc := BuildAccountSnapshot(sampleJob(), models.BuildStatSnapshot{TotalJobCost: 500}, buildNow)
	if doc.TransactionLines[0].ProratedCost != 0 {
		t.Fatalf("proratedCost = %v, want 0", doc.TransactionLines[0].ProratedCost)
	}
	if doc.UnsoldCost != 0 {
		t.Fatalf("unsoldCost = %v, want 0", doc.UnsoldCost)
	}
}

// A transaction naming no corporation inherits the order's, and a fee inherits it
// too — otherwise a corporation sale reads as personal.
func TestLinesInheritCorporationFromTheirOrder(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.MarketOrders[0] = models.MarketOrder{OrderID: 900, IsCorporation: true, CorporationRef: "corp_a"}

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)

	tx := doc.TransactionLines[0]
	if !tx.IsCorp || tx.ResolvedCorpRef != "corp_a" || tx.CorpStatus != models.CorpStatusCorpKnown {
		t.Fatalf("transaction = %+v, want corp_a known", tx.ArchivedJobLine)
	}
	fee := doc.FeeLines[0]
	if !fee.IsCorp || fee.ResolvedCorpRef != "corp_a" || fee.CorpStatus != models.CorpStatusCorpKnown {
		t.Fatalf("fee = %+v, want corp_a known", fee.ArchivedJobLine)
	}
}

// When neither the line nor its order names a corporation, a single distinct
// corporation across the linked facility jobs resolves it.
func TestLinesFallBackToTheInferredCorporation(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.LinkedJobs = linked("corp_a", "corp_a")

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	if doc.TransactionLines[0].ResolvedCorpRef != "corp_a" {
		t.Fatalf("transaction corp = %q, want corp_a", doc.TransactionLines[0].ResolvedCorpRef)
	}
	if doc.FeeLines[0].ResolvedCorpRef != "corp_a" {
		t.Fatalf("fee corp = %q, want corp_a", doc.FeeLines[0].ResolvedCorpRef)
	}
}

// Two corporations across the linked jobs must resolve to none rather than pick
// one, so no corporation is credited revenue it may not have earned.
func TestAmbiguousCorporationIsNotAttributed(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.LinkedJobs = linked("corp_a", "corp_b")

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	line := doc.TransactionLines[0]
	if line.ResolvedCorpRef != "" {
		t.Fatalf("resolvedCorpRef = %q, want empty when ambiguous", line.ResolvedCorpRef)
	}
	if line.CorpStatus != models.CorpStatusPersonal {
		t.Fatalf("corpStatus = %q; an unattributed line stays personal", line.CorpStatus)
	}
}

// A corporation line whose corporation cannot be named is recorded as such rather
// than silently counted as personal.
func TestCorpLineWithoutARefIsMarkedUnknown(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.Transactions[0].IsCorp = true

	line := BuildAccountSnapshot(job, sampleSnap(), buildNow).TransactionLines[0]
	if line.CorpStatus != models.CorpStatusCorpUnknown {
		t.Fatalf("corpStatus = %q, want corp_unknown", line.CorpStatus)
	}
	if line.ResolvedCorpRef != "" {
		t.Fatal("an unknown corporation must not be recorded as resolved")
	}
}

// Costs belong to the month production started, not the month the job was
// archived, so a build spanning a boundary keeps its costs where they were spent.
func TestCostMonthComesFromTheEarliestLinkedJob(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.LinkedJobs = []models.LinkedESIJob{
		{JobID: 1, StartDate: "2026-04-20T00:00:00Z"},
		{JobID: 2, StartDate: "2026-03-05T00:00:00Z"},
	}

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	if doc.CostMonth.Year != 2026 || doc.CostMonth.Month != 3 {
		t.Fatalf("costMonth = %+v, want 2026-3", doc.CostMonth)
	}
}

func TestCostMonthFallsBackThroughSalesToArchiveDate(t *testing.T) {
	t.Parallel()

	job := sampleJob() // no linked jobs; earliest transaction is June
	if got := BuildAccountSnapshot(job, sampleSnap(), buildNow).CostMonth; got.Month != 6 {
		t.Fatalf("costMonth = %+v, want the earliest sale month 6", got)
	}

	job.Build.Sale.Transactions = nil
	job.MetaData.ArchivedAt = time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	if got := BuildAccountSnapshot(job, sampleSnap(), buildNow).CostMonth; got.Month != 2 {
		t.Fatalf("costMonth = %+v, want the archive month 2", got)
	}
}

// An unreadable date must not drop the line from the totals.
func TestUnparsableLineDateFallsBackToTheArchiveDate(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.Transactions[0].Date = "not a date"

	line := BuildAccountSnapshot(job, sampleSnap(), buildNow).TransactionLines[0]
	if line.Year != 2026 || line.Month != 6 {
		t.Fatalf("line month = %d-%d, want the archive month 2026-6", line.Year, line.Month)
	}
}

func TestExtraCategoryTotalsFoldByCategory(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.ExtrasCosts = []models.ExtraCost{
		{Category: "shipping", ExtraValue: 10},
		{Category: "shipping", ExtraValue: 5},
		{Category: "", ExtraValue: 3},
	}

	totals := BuildAccountSnapshot(job, sampleSnap(), buildNow).ExtraCategoryTotals
	if totals["shipping"] != 15 {
		t.Fatalf("shipping = %v, want 15", totals["shipping"])
	}
	if totals["0"] != 3 {
		t.Fatalf("uncategorised = %v, want 3 under \"0\"", totals["0"])
	}
}

// Rebuilding the same job must produce the same document, or historical months
// shift under readers.
func TestBuildIsDeterministic(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.LinkedJobs = linked("corp_b", "corp_a")
	job.Build.Costs.ExtrasCosts = []models.ExtraCost{{Category: "x", ExtraValue: 1}}

	first := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	for range 8 {
		again := BuildAccountSnapshot(job, sampleSnap(), buildNow)
		if again.ID != first.ID || again.CostMonth != first.CostMonth {
			t.Fatal("identity or cost month changed between rebuilds")
		}
		if len(again.LinkedIndustryCorpRefs) != len(first.LinkedIndustryCorpRefs) {
			t.Fatal("linked corporation refs changed between rebuilds")
		}
		for i := range first.LinkedIndustryCorpRefs {
			if again.LinkedIndustryCorpRefs[i] != first.LinkedIndustryCorpRefs[i] {
				t.Fatalf("linked corporation refs reordered: %v vs %v",
					again.LinkedIndustryCorpRefs, first.LinkedIndustryCorpRefs)
			}
		}
	}
}

func TestSnapshotCarriesAccountIdentityAndStamps(t *testing.T) {
	t.Parallel()

	doc := BuildAccountSnapshot(sampleJob(), sampleSnap(), buildNow)
	if doc.AccountID != "acct-1" {
		t.Fatalf("accountID = %q", doc.AccountID)
	}
	if doc.ID != "acct-1|job-1" {
		t.Fatalf("_id = %q, want acct-1|job-1", doc.ID)
	}
	if !doc.ProcessedAt.Equal(buildNow) {
		t.Fatalf("processedAt = %v, want the supplied clock %v", doc.ProcessedAt, buildNow)
	}
	if doc.Revoked {
		t.Fatal("a freshly built snapshot must not be revoked")
	}
}

// A job with no archive date is stamped with the supplied clock rather than the
// zero time, which would land it in year 1.
// A job imported from a source with no archive timestamp falls back to the
// document's own dates. The rebuild clock must not be reachable here: it decides
// the cost month, so using it files the costs under whichever month the rebuild
// ran in and moves them on the next run.
func TestMissingArchiveDateFallsBackToDocumentTimestamps(t *testing.T) {
	t.Parallel()

	lastModified := time.Date(2026, 4, 9, 0, 0, 0, 0, time.UTC)
	created := time.Date(2026, 2, 3, 0, 0, 0, 0, time.UTC)

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.LastModified = lastModified
	job.MetaData.CreatedAt = created
	job.Build.Sale.Transactions = nil
	job.Build.Sale.BrokersFee = nil
	job.Build.Costs.LinkedJobs = nil

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	if !doc.ArchivedAt.Equal(lastModified) {
		t.Fatalf("archivedAt = %v, want lastModified %v", doc.ArchivedAt, lastModified)
	}
	if doc.CostMonth.Year != 2026 || doc.CostMonth.Month != 4 {
		t.Fatalf("costMonth = %+v, want 2026-4 from lastModified, not %d-%d from the clock",
			doc.CostMonth, buildNow.Year(), int(buildNow.Month()))
	}
}

// createdAt covers a document old enough to predate lastModified being written.
func TestMissingArchiveAndModifiedDatesFallBackToCreated(t *testing.T) {
	t.Parallel()

	created := time.Date(2026, 2, 3, 0, 0, 0, 0, time.UTC)

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.LastModified = time.Time{}
	job.MetaData.CreatedAt = created
	job.Build.Sale.Transactions = nil
	job.Build.Sale.BrokersFee = nil
	job.Build.Costs.LinkedJobs = nil

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	if !doc.ArchivedAt.Equal(created) {
		t.Fatalf("archivedAt = %v, want createdAt %v", doc.ArchivedAt, created)
	}
	if doc.CostMonth.Month != 2 {
		t.Fatalf("costMonth = %+v, want 2026-2 from createdAt", doc.CostMonth)
	}
}

// The property the pinned cost month exists to guarantee: rebuilding the same
// job at a different time must not move its costs to another month.
func TestCostMonthDoesNotMoveWithTheRebuildClock(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.LastModified = time.Date(2026, 4, 9, 0, 0, 0, 0, time.UTC)
	job.Build.Sale.Transactions = nil
	job.Build.Sale.BrokersFee = nil
	job.Build.Costs.LinkedJobs = nil

	first := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	later := BuildAccountSnapshot(job, sampleSnap(), buildNow.AddDate(0, 5, 0))

	if first.CostMonth != later.CostMonth {
		t.Fatalf("costMonth moved between rebuilds: %+v then %+v", first.CostMonth, later.CostMonth)
	}
}

// A document with no usable timestamp keeps a month rather than dropping its
// costs out of every bucket while still counting in lifetime totals.
func TestJobWithNoTimestampsStillGetsAMonth(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.LastModified = time.Time{}
	job.MetaData.CreatedAt = time.Time{}
	job.Build.Sale.Transactions = nil
	job.Build.Sale.BrokersFee = nil
	job.Build.Costs.LinkedJobs = nil

	doc := BuildAccountSnapshot(job, sampleSnap(), buildNow)
	if doc.CostMonth.Year == 0 {
		t.Fatal("costMonth is unset; the row would count in totals but no month")
	}
}
