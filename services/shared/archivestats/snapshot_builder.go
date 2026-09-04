// Package archivestats turns an archived job into the figures the statistics
// pipelines read. Everything here is a pure transformation: no Mongo, no clock,
// no key material, so the rules are testable in isolation from the worker that
// applies them.
package archivestats

import (
	"strings"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// lineDateLayouts are the formats archived job lines have been written in. ESI
// sends RFC3339; older planner documents carry the second form.
var lineDateLayouts = []string{time.RFC3339, "2006-01-02 15:04:05"}

// parseLineDate falls back rather than failing: a line with an unreadable date
// still belongs in the totals, attributed to the job's archive date, which is
// closer than dropping it.
func parseLineDate(raw string, fallback time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback.UTC()
	}
	for _, layout := range lineDateLayouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC()
		}
	}
	return fallback.UTC()
}

// extraCategoryTotals folds a job's extra costs by category. An extra with no
// category is counted under "0" rather than dropped, so the categories always sum
// to the job's extras total.
func extraCategoryTotals(extras []models.ExtraCost) map[string]float64 {
	if len(extras) == 0 {
		return nil
	}
	out := make(map[string]float64, len(extras))
	for _, e := range extras {
		category := strings.TrimSpace(e.Category)
		if category == "" {
			category = "0"
		}
		out[category] += e.ExtraValue
	}
	return out
}

// archiveDateFor resolves the date a job is treated as archived on.
//
// `_meta.archivedAt` is set by the archive write path, so a job that lacks it was
// imported from a source that carried no archive timestamp rather than archived
// through the app. The document's own timestamps stand in: lastModified is
// always written, and createdAt covers a document old enough to predate it.
//
// The rebuild clock is deliberately not a fallback. It is the only candidate that
// changes between runs, and this value reaches costMonthFor, so using it would
// file a job's costs under whichever month the rebuild happened to run in and
// move them on the next rebuild. Cost months are pinned precisely so history does
// not shift underneath a reader.
//
// now is returned only when a document carries no usable timestamp at all, which
// leaves the row attributed rather than dropping its costs from every month.
func archiveDateFor(job models.Job, now time.Time) time.Time {
	for _, candidate := range []time.Time{
		job.MetaData.ArchivedAt,
		job.MetaData.LastModified,
		job.MetaData.CreatedAt,
	} {
		if !candidate.IsZero() {
			return candidate.UTC()
		}
	}
	return now.UTC()
}

// costMonthFor decides which calendar month a job's build costs are attributed to.
//
// Costs are attributed to when production started, not when the job was archived,
// so a build spanning a month boundary does not move its costs into the month its
// sales landed in. Linked industry jobs date that; a job with none falls back to
// its earliest sale, then to its archive date. Pinning it on the document keeps a
// rebuild from re-deciding it and shifting historical months.
func costMonthFor(job models.Job, archivedAt time.Time) models.CalendarMonth {
	// A cost carries no date of its own, so a month the user filed it under is
	// better evidence than anything derived here.
	if job.FiledCostMonth.Valid() {
		return *job.FiledCostMonth
	}
	if earliest, ok := earliestLinkedJobDate(job.Build.Costs.LinkedJobs, archivedAt); ok {
		return monthOf(earliest)
	}
	if earliest, ok := earliestTransactionDate(job.Build.Sale.Transactions, archivedAt); ok {
		return monthOf(earliest)
	}
	return monthOf(archivedAt)
}

func monthOf(t time.Time) models.CalendarMonth {
	t = t.UTC()
	return models.CalendarMonth{Year: t.Year(), Month: int(t.Month())}
}

func earliestLinkedJobDate(linked []models.LinkedESIJob, fallback time.Time) (time.Time, bool) {
	var earliest time.Time
	found := false
	for _, lj := range linked {
		for _, raw := range []string{lj.StartDate, lj.EndDate, lj.CompletedDate} {
			if strings.TrimSpace(raw) == "" {
				continue
			}
			t := parseLineDate(raw, fallback)
			if !found || t.Before(earliest) {
				earliest, found = t, true
			}
		}
	}
	return earliest, found
}

func earliestTransactionDate(transactions []models.Transaction, fallback time.Time) (time.Time, bool) {
	var earliest time.Time
	found := false
	for _, t := range transactions {
		if strings.TrimSpace(t.Date) == "" {
			continue
		}
		td := parseLineDate(t.Date, fallback)
		if !found || td.Before(earliest) {
			earliest, found = td, true
		}
	}
	return earliest, found
}

// BuildAccountSnapshot reduces one archived job to the account-scoped statistics
// row for it. now stamps ProcessedAt and stands in for a missing archive date, so
// callers control the clock.
//
// The row is returned uncounted. Whether its figures are in the aggregates is not
// a property of the job, and only a caller that wrote them can say so — a caller
// that merely creates the row leaves it outstanding for the next fold.
func BuildAccountSnapshot(job models.Job, snap models.BuildStatSnapshot, now time.Time) models.ArchivedJobStats {
	doc := buildSnapshot(job, snap, now)
	doc.AccountID = job.MetaData.AccountID
	doc.ID = eipmongo.ArchivedJobStatsDocumentID(doc.AccountID, job.JobID)
	return doc
}

func buildSnapshot(job models.Job, snap models.BuildStatSnapshot, now time.Time) models.ArchivedJobStats {
	now = now.UTC()
	archivedAt := archiveDateFor(job, now)

	costPerItem := 0.0
	if snap.TotalProduced > 0 {
		costPerItem = snap.TotalJobCost / snap.TotalProduced
	}

	transactionLines, soldQuantity := buildTransactionLines(job, archivedAt, costPerItem)
	feeLines := buildFeeLines(job, archivedAt)

	unsoldQuantity := max(snap.TotalProduced-soldQuantity, 0)

	return models.ArchivedJobStats{
		JobID:             job.JobID,
		TypeID:            job.ItemID,
		JobType:           job.JobType,
		IsProductionChain: len(job.ParentJobs) > 0,
		// A retained build is produced but deliberately not sold, so it must not
		// read as an unsold shortfall in the aggregates.
		ArchivedAt:          archivedAt,
		CostMonth:           costMonthFor(job, archivedAt),
		MonthsFiled:         job.FilesItsOwnMonths(),
		TotalProduced:       snap.TotalProduced,
		TotalMaterialCost:   snap.TotalMaterialCost,
		TotalInstallCost:    snap.TotalInstallCost,
		TotalExtras:         snap.TotalExtras,
		TotalInventionCost:  snap.TotalInventionCost,
		TotalCostPerItem:    snap.TotalCostPerItem,
		ExtraCategoryTotals: extraCategoryTotals(job.Build.Costs.ExtrasCosts),
		UnsoldQuantity:      unsoldQuantity,
		UnsoldCost:          unsoldQuantity * costPerItem,
		TransactionLines:    transactionLines,
		FeeLines:            feeLines,
		ProcessedAt:         now,
		// A row a rebuild produced is already counted: the same pass writes the
		// aggregates from it. Leaving it unstamped would offer it to the next
		// incremental pass as outstanding work and count it a second time, on top
		// of totals that are already whole.
	}
}

func buildTransactionLines(
	job models.Job,
	archivedAt time.Time,
	costPerItem float64,
) ([]models.ArchivedJobTransactionLine, float64) {
	lines := make([]models.ArchivedJobTransactionLine, 0, len(job.Build.Sale.Transactions))
	soldQuantity := 0.0

	// Only a job whose sales are all hand-entered can be filed: money the market
	// recorded arrived when it arrived.
	filed := filedSalesMonth(job)

	for _, t := range job.Build.Sale.Transactions {
		quantity := float64(t.Quantity)
		soldQuantity += quantity

		date := parseLineDate(t.Date, archivedAt)
		proratedCost := quantity * costPerItem
		lines = append(lines, models.ArchivedJobTransactionLine{
			TransactionID: t.TransactionID,
			OrderID:       t.OrderID,
			Date:          date,
			CalendarMonth: lineMonth(filed, date),
			Amount:        t.Amount,
			Quantity:      quantity,
			Tax:           t.Tax,
			ProratedCost:  proratedCost,
			Profit:        t.Amount - t.Tax - proratedCost,
		})
	}
	return lines, soldQuantity
}

// filedSalesMonth is the month the user filed this job's income under, or nil
// when they may not: a job with a market sale is filed by the market.
func filedSalesMonth(job models.Job) *models.CalendarMonth {
	if job.SalesAreFromMarket() {
		return nil
	}
	if !job.FiledSalesMonth.Valid() {
		return nil
	}
	return job.FiledSalesMonth
}

// lineMonth prefers a filed month over the line's own date.
func lineMonth(filed *models.CalendarMonth, date time.Time) models.CalendarMonth {
	if filed != nil {
		return *filed
	}
	return monthOf(date)
}

func buildFeeLines(job models.Job, archivedAt time.Time) []models.ArchivedJobFeeLine {
	lines := make([]models.ArchivedJobFeeLine, 0, len(job.Build.Sale.BrokersFee))

	// A broker fee belongs to a market order, so it moves with the income it was
	// charged against and only when that income was not the market's.
	filed := filedSalesMonth(job)

	for _, f := range job.Build.Sale.BrokersFee {
		date := parseLineDate(f.Date, archivedAt)
		lines = append(lines, models.ArchivedJobFeeLine{
			FeeID:         f.ID,
			OrderID:       f.OrderID,
			Date:          date,
			CalendarMonth: lineMonth(filed, date),
			Amount:        f.Amount,
		})
	}
	return lines
}

// EvidencedArchiveDate returns the earliest date a job's own records show work
// happening, and whether any such record exists.
//
// This is the evidence `_meta.archivedAt` should have carried. A job imported
// from a source that recorded no archive timestamp can still be dated by its
// linked industry jobs or its sales; a job with neither cannot be dated at all,
// and says so rather than substituting a date that only looks precise.
//
// The document's own createdAt is deliberately not consulted. On imported jobs it
// records when the import ran, so it would date months of history to the week the
// migration happened.
func EvidencedArchiveDate(job models.Job) (time.Time, bool) {
	// The zero time is only a parse fallback here; both helpers report whether
	// they found anything, so it is never returned as a real date.
	var none time.Time
	if earliest, ok := earliestLinkedJobDate(job.Build.Costs.LinkedJobs, none); ok && !earliest.IsZero() {
		return earliest.UTC(), true
	}
	if earliest, ok := earliestTransactionDate(job.Build.Sale.Transactions, none); ok && !earliest.IsZero() {
		return earliest.UTC(), true
	}
	return time.Time{}, false
}
