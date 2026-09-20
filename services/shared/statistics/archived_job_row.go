// Package statistics turns an archived job into the figures the statistics
// pipelines read. Everything here is a pure transformation: no Mongo, no clock,
// no key material, so the rules are testable in isolation from the worker that
// applies them.
package statistics

import (
	"maps"
	"slices"
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

// extraCategories sums a job's extras per category, carrying the name each was
// added under.
//
// Categories come out in the order their rows' ids sort, so a row written twice
// from the same job is the same document. An extra with no label leaves it
// empty: a reader shows the id, which is what it could do before, rather than
// the row inventing a name.
func extraCategories(extras map[string]models.ExtraCost) []models.ArchivedExtraCategory {
	if len(extras) == 0 {
		return nil
	}
	out := make([]models.ArchivedExtraCategory, 0, len(extras))
	at := make(map[string]int, len(extras))
	// Sorted rather than ranged: the rows come out of a map, and this list is
	// stored on the statistics row, so walking them in whatever order the keys
	// give would write a different document on each rebuild.
	for _, id := range slices.Sorted(maps.Keys(extras)) {
		e := extras[id]
		// Settled rather than taken as given: a row built in code has not been
		// through a decoder, and an unfiled extra must still sum into the total.
		category := models.ExtrasCategoryOrUnassigned(e.Category)
		i, seen := at[category]
		if !seen {
			at[category] = len(out)
			out = append(out, models.ArchivedExtraCategory{ID: category, Label: strings.TrimSpace(e.CategoryLabel)})
			i = len(out) - 1
		}
		out[i].Amount += e.ExtraValue
		if out[i].Label == "" {
			out[i].Label = strings.TrimSpace(e.CategoryLabel)
		}
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
	if earliest, ok := earliestLinkedJobDate(job.ESI.LinkedJobs, archivedAt); ok {
		return monthOf(earliest)
	}
	if earliest, ok := earliestTransactionDate(job.ESI.Transactions, archivedAt); ok {
		return monthOf(earliest)
	}
	return monthOf(archivedAt)
}

func monthOf(t time.Time) models.CalendarMonth {
	t = t.UTC()
	return models.CalendarMonth{Year: t.Year(), Month: int(t.Month())}
}

// The rows come out of a map, but only the earliest date is returned and a
// minimum does not depend on the order it is taken in.
func earliestLinkedJobDate(linked map[string]models.LinkedESIJob, fallback time.Time) (time.Time, bool) {
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

// Order-independent for the reason earliestLinkedJobDate gives.
func earliestTransactionDate(transactions map[string]models.Transaction, fallback time.Time) (time.Time, bool) {
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

// RowFromFigures reduces one archived job to its statistics row, given the
// figures already computed for it. now stands in for a missing archive date, so
// callers control the clock.
//
// The row is returned uncounted. Whether its figures are in the aggregates is not
// a property of the job, and only a caller that wrote them can say so — a caller
// that merely creates the row leaves it outstanding for the next fold.
func RowFromFigures(job models.Job, snap models.JobFigures, now time.Time) models.ArchivedJobStats {
	doc := buildRow(job, snap, now)
	doc.Owner = job.MetaData.Owner
	doc.ID = eipmongo.ArchivedJobStatsDocumentID(doc.Owner, job.JobID)
	return doc
}

func buildRow(job models.Job, snap models.JobFigures, now time.Time) models.ArchivedJobStats {
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
		SchemaVersion:     models.ArchivedJobStatsSchemaCurrent,
		JobID:             job.JobID,
		TypeID:            job.ItemID,
		JobType:           job.JobType,
		IsProductionChain: len(job.ParentJobs) > 0,
		// Who archived it, which inside a shared planner is a different question
		// from who owns the row.
		ArchivedBy:         job.MetaData.ArchivedBy,
		ArchivedAt:         archivedAt,
		CostMonth:          costMonthFor(job, archivedAt),
		MonthsFiled:        job.FilesItsOwnMonths(),
		TotalProduced:      snap.TotalProduced,
		TotalMaterialCost:  snap.TotalMaterialCost,
		TotalInstallCost:   snap.TotalInstallCost,
		TotalExtras:        snap.TotalExtras,
		TotalInventionCost: snap.TotalInventionCost,
		TotalCostPerItem:   snap.TotalCostPerItem,
		ExtraCategories:    extraCategories(job.Build.ExtrasCosts),
		UnsoldQuantity:     unsoldQuantity,
		UnsoldCost:         unsoldQuantity * costPerItem,
		TransactionLines:   transactionLines,
		FeeLines:           feeLines,
	}
}

func buildTransactionLines(
	job models.Job,
	archivedAt time.Time,
	costPerItem float64,
) ([]models.ArchivedJobTransactionLine, float64) {
	lines := make([]models.ArchivedJobTransactionLine, 0, len(job.ESI.Transactions))
	soldQuantity := 0.0

	// Only a job whose sales are all hand-entered can be filed: money the market
	// recorded arrived when it arrived.
	filed := filedSalesMonth(job)

	// Sorted rather than ranged: these lines are stored on the statistics row, so
	// walking a map in whatever order the keys give would write a different
	// document on each rebuild.
	for _, key := range slices.Sorted(maps.Keys(job.ESI.Transactions)) {
		t := job.ESI.Transactions[key]
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
	lines := make([]models.ArchivedJobFeeLine, 0, len(job.ESI.MarketOrders))

	// A broker fee belongs to a market order, so it moves with the income it was
	// charged against and only when that income was not the market's.
	filed := filedSalesMonth(job)

	// Sorted for the reason buildTransactionLines gives: this list is stored.
	for _, key := range slices.Sorted(maps.Keys(job.ESI.MarketOrders)) {
		o := job.ESI.MarketOrders[key]
		// An order charged nothing has no fee line. The fee lives on the order
		// now, so every order would otherwise produce one.
		if o.Fee == 0 {
			continue
		}
		date := parseLineDate(o.FeeDate, archivedAt)
		lines = append(lines, models.ArchivedJobFeeLine{
			OrderID:       o.OrderID,
			Date:          date,
			CalendarMonth: lineMonth(filed, date),
			Amount:        o.Fee,
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
	if earliest, ok := earliestLinkedJobDate(job.ESI.LinkedJobs, none); ok && !earliest.IsZero() {
		return earliest.UTC(), true
	}
	if earliest, ok := earliestTransactionDate(job.ESI.Transactions, none); ok && !earliest.IsZero() {
		return earliest.UTC(), true
	}
	return time.Time{}, false
}
