package statistics

import (
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

var buildNow = time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)

func sampleJob() models.Job {
	job := models.Job{JobID: "job-1", ItemID: 34, JobType: 1}
	job.MetaData.Owner = models.AccountOwner("acct-1")
	job.MetaData.ArchivedAt = time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	job.Build.Sale.Transactions = []models.Transaction{
		{TransactionID: 1, OrderID: 900, Quantity: 4, Amount: 400, Tax: 40, Date: "2026-06-01T00:00:00Z"},
	}
	job.Build.Sale.MarketOrders = []models.MarketOrder{{OrderID: 900}}
	job.Build.Sale.BrokersFee = []models.BrokerFee{{ID: 7, OrderID: 900, Amount: 5, Date: "2026-06-02T00:00:00Z"}}
	return job
}

func sampleSnap() models.JobFigures {
	return models.JobFigures{TotalProduced: 10, TotalJobCost: 500}
}

// Cost per item prorates the job's cost across what actually sold, and profit is
// net of both tax and that share.
func TestTransactionLinesProrateCostAndProfit(t *testing.T) {
	t.Parallel()

	doc := RowFromFigures(sampleJob(), sampleSnap(), buildNow)
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

	doc := RowFromFigures(sampleJob(), sampleSnap(), buildNow)
	if doc.UnsoldQuantity != 6 { // 10 produced − 4 sold
		t.Fatalf("unsoldQuantity = %v, want 6", doc.UnsoldQuantity)
	}
	if doc.UnsoldCost != 300 { // 6 × 50
		t.Fatalf("unsoldCost = %v, want 300", doc.UnsoldCost)
	}
}

// Selling more than the snapshot recorded as produced must not report negative
// stock, which would subtract from the owner's totals.
func TestOversoldJobDoesNotReportNegativeUnsold(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.Transactions[0].Quantity = 25
	doc := RowFromFigures(job, sampleSnap(), buildNow)

	if doc.UnsoldQuantity != 0 {
		t.Fatalf("unsoldQuantity = %v, want 0", doc.UnsoldQuantity)
	}
	if doc.UnsoldCost != 0 {
		t.Fatalf("unsoldCost = %v, want 0", doc.UnsoldCost)
	}
}

func TestZeroProducedDoesNotDivideByZero(t *testing.T) {
	t.Parallel()

	doc := RowFromFigures(sampleJob(), models.JobFigures{TotalJobCost: 500}, buildNow)
	if doc.TransactionLines[0].ProratedCost != 0 {
		t.Fatalf("proratedCost = %v, want 0", doc.TransactionLines[0].ProratedCost)
	}
	if doc.UnsoldCost != 0 {
		t.Fatalf("unsoldCost = %v, want 0", doc.UnsoldCost)
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

	doc := RowFromFigures(job, sampleSnap(), buildNow)
	if doc.CostMonth.Year != 2026 || doc.CostMonth.Month != 3 {
		t.Fatalf("costMonth = %+v, want 2026-3", doc.CostMonth)
	}
}

func TestCostMonthFallsBackThroughSalesToArchiveDate(t *testing.T) {
	t.Parallel()

	job := sampleJob() // no linked jobs; earliest transaction is June
	if got := RowFromFigures(job, sampleSnap(), buildNow).CostMonth; got.Month != 6 {
		t.Fatalf("costMonth = %+v, want the earliest sale month 6", got)
	}

	job.Build.Sale.Transactions = nil
	job.MetaData.ArchivedAt = time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	if got := RowFromFigures(job, sampleSnap(), buildNow).CostMonth; got.Month != 2 {
		t.Fatalf("costMonth = %+v, want the archive month 2", got)
	}
}

// An unreadable date must not drop the line from the totals.
func TestUnparsableLineDateFallsBackToTheArchiveDate(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Sale.Transactions[0].Date = "not a date"

	line := RowFromFigures(job, sampleSnap(), buildNow).TransactionLines[0]
	if line.Year != 2026 || line.Month != 6 {
		t.Fatalf("line month = %d-%d, want the archive month 2026-6", line.Year, line.Month)
	}
}

func TestExtraCategoryTotalsFoldByCategory(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.ExtrasCosts = []models.ExtraCost{
		{Category: "shipping", CategoryLabel: "Hauling Service", ExtraValue: 10},
		{Category: "shipping", CategoryLabel: "Hauling Service", ExtraValue: 5},
		{Category: "", ExtraValue: 3},
	}

	got := map[string]models.ArchivedExtraCategory{}
	for _, entry := range RowFromFigures(job, sampleSnap(), buildNow).ExtraCategories {
		got[entry.ID] = entry
	}

	if got["shipping"].Amount != 15 {
		t.Fatalf("shipping = %v, want 15", got["shipping"].Amount)
	}
	// The name travels with the money: the archive cannot reach the settings
	// document the id would otherwise be read against.
	if got["shipping"].Label != "Hauling Service" {
		t.Fatalf("shipping label = %q, want the name it was added under", got["shipping"].Label)
	}
	if got["0"].Amount != 3 {
		t.Fatalf("uncategorised = %v, want 3 under \"0\"", got["0"].Amount)
	}
	// An extra added with no label leaves it empty rather than the row inventing
	// one; a reader falls back to showing the id, as it could before.
	if got["0"].Label != "" {
		t.Fatalf("uncategorised label = %q, want none", got["0"].Label)
	}
}

// Rebuilding the same job must produce the same document, or historical months
// shift under readers.
func TestBuildIsDeterministic(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.Build.Costs.LinkedJobs = []models.LinkedESIJob{
		{JobID: 2, StartDate: "2026-05-04T00:00:00Z"},
		{JobID: 1, StartDate: "2026-05-02T00:00:00Z"},
	}
	job.Build.Costs.ExtrasCosts = []models.ExtraCost{{Category: "x", ExtraValue: 1}}

	first := RowFromFigures(job, sampleSnap(), buildNow)
	for range 8 {
		again := RowFromFigures(job, sampleSnap(), buildNow)
		if again.ID != first.ID || again.CostMonth != first.CostMonth {
			t.Fatal("identity or cost month changed between rebuilds")
		}
		if len(again.TransactionLines) != len(first.TransactionLines) {
			t.Fatal("transaction lines changed between rebuilds")
		}
	}
}

func TestRowCarriesTheOwnerAndKeysOnIt(t *testing.T) {
	t.Parallel()

	doc := RowFromFigures(sampleJob(), sampleSnap(), buildNow)
	if doc.Owner != models.AccountOwner("acct-1") {
		t.Fatalf("owner = %+v, want the job's account", doc.Owner)
	}
	if doc.ID != "account:acct-1|job-1" {
		t.Fatalf("_id = %q, want account:acct-1|job-1 — the id leads with the owner key", doc.ID)
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

	doc := RowFromFigures(job, sampleSnap(), buildNow)
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

	doc := RowFromFigures(job, sampleSnap(), buildNow)
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

	first := RowFromFigures(job, sampleSnap(), buildNow)
	later := RowFromFigures(job, sampleSnap(), buildNow.AddDate(0, 5, 0))

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

	doc := RowFromFigures(job, sampleSnap(), buildNow)
	if doc.CostMonth.Year == 0 {
		t.Fatal("costMonth is unset; the row would count in totals but no month")
	}
}

// The backfill writes archivedAt from a job's own records. createdAt is
// deliberately excluded: on imported jobs it records when the import ran, so
// using it would date months of history to the week of the migration.
func TestEvidencedArchiveDateUsesTheJobsOwnRecords(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.CreatedAt = time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)

	got, ok := EvidencedArchiveDate(job)
	if !ok {
		t.Fatal("a job with linked jobs and sales must be datable")
	}
	if got.Year() == 2026 && got.Month() == time.April && got.Day() == 10 {
		t.Fatal("createdAt was used; it records the import, not the work")
	}
}

// A job with nothing to date it says so, rather than returning a zero time a
// caller might mistake for a real date.
func TestEvidencedArchiveDateReportsWhenItCannotDate(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.MetaData.CreatedAt = time.Date(2026, 4, 10, 0, 0, 0, 0, time.UTC)
	job.Build.Costs.LinkedJobs = nil
	job.Build.Sale.Transactions = nil

	got, ok := EvidencedArchiveDate(job)
	if ok {
		t.Fatalf("reported a date (%v) for a job with no linked jobs and no sales", got)
	}
	if !got.IsZero() {
		t.Fatalf("returned %v alongside ok=false; callers check ok, but a non-zero value invites misuse", got)
	}
}

// Sales date a job that has no linked industry jobs.
func TestEvidencedArchiveDateFallsBackToSales(t *testing.T) {
	t.Parallel()

	job := sampleJob()
	job.MetaData.ArchivedAt = time.Time{}
	job.Build.Costs.LinkedJobs = nil

	got, ok := EvidencedArchiveDate(job)
	if !ok {
		t.Fatal("a job with sales must be datable from them")
	}
	if got.IsZero() {
		t.Fatal("returned a zero date with ok=true")
	}
}

// A job can gain a market sale after its months were filed — ESI links a
// transaction to a build that was entered by hand. The filing is then no longer
// the user's to apply, and the reduction is what has to notice: the endpoint
// only guards the moment the choice is made.
func TestMarketSalesIgnoreAFiledSalesMonth(t *testing.T) {
	filed := models.CalendarMonth{Year: 2026, Month: 4}
	job := models.Job{JobID: "job-filed-market", ItemID: 34, ItemsProducedPerRun: 1}
	job.Build.Setup = map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}}
	job.FiledSalesMonth = &filed
	job.Build.Sale.Transactions = []models.Transaction{{
		TransactionID: 6000000001, // ESI's own
		Quantity:      1,
		Amount:        100,
		Date:          "2026-08-10T00:00:00Z",
	}}

	row, err := NewRow(job, time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("NewRow: %v", err)
	}
	if got := row.TransactionLines[0].CalendarMonth; got != (models.CalendarMonth{Year: 2026, Month: 8}) {
		t.Fatalf("market sale filed under %+v, want the month the money arrived", got)
	}
}

// The same job without the market line is the user's to file.
func TestHandEnteredSalesFollowAFiledSalesMonth(t *testing.T) {
	filed := models.CalendarMonth{Year: 2026, Month: 4}
	job := models.Job{JobID: "job-filed-hand", ItemID: 34, ItemsProducedPerRun: 1}
	job.Build.Setup = map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}}
	job.FiledSalesMonth = &filed
	job.Build.Sale.Transactions = []models.Transaction{{
		TransactionID: -1700000000001,
		Quantity:      1,
		Amount:        100,
		Date:          "2026-08-10T00:00:00Z",
	}}
	job.Build.Sale.BrokersFee = []models.BrokerFee{{ID: -1, Amount: 5, Date: "2026-08-09T00:00:00Z"}}

	row, err := NewRow(job, time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("NewRow: %v", err)
	}
	if got := row.TransactionLines[0].CalendarMonth; got != filed {
		t.Fatalf("hand-entered sale filed under %+v, want %+v", got, filed)
	}
	// The fee was charged against that income, so it moves with it.
	if got := row.FeeLines[0].CalendarMonth; got != filed {
		t.Fatalf("broker fee filed under %+v, want %+v", got, filed)
	}
}

// The row is written with an owner from the day it is built, so nothing has to
// infer one later from the account id beside it.
func TestNewRowNamesItsOwnerAndSchema(t *testing.T) {
	t.Parallel()

	job := models.Job{JobID: "job-owned", ItemID: 34, ItemsProducedPerRun: 1}
	job.Build.Setup = map[string]models.JobSetup{"s1": {ID: "s1", RunCount: 1, JobCount: 1}}
	job.MetaData.Owner = models.AccountOwner("acct-1")
	job.MetaData.ArchivedBy = "acct-2"

	row, err := NewRow(job, time.Now().UTC())
	if err != nil {
		t.Fatalf("NewRow: %v", err)
	}

	if row.Owner != models.AccountOwner("acct-1") {
		t.Fatalf("owner = %+v, want the job's account", row.Owner)
	}
	if row.Owner != models.AccountOwner("acct-1") {
		t.Fatalf("owner = %+v, want the job's account", row.Owner)
	}
	// Who archived it is not who owns it: inside a shared planner a member
	// archives into a planner they do not own.
	if row.ArchivedBy != "acct-2" {
		t.Fatalf("archivedBy = %q, want the account that archived it", row.ArchivedBy)
	}
	if row.SchemaVersion != models.ArchivedJobStatsSchemaCurrent {
		t.Fatalf("schemaVersion = %d", row.SchemaVersion)
	}
}
