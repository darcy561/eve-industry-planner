package statistics

import (
	"eve-industry-planner/shared/models"
)

// BuildCostPerItem is what one unit of a row's output cost to build.
//
// Build cost, not total: the figure is read against an estimate of building the
// item, and broker and transaction fees are sale-side. Zero output has no
// per-unit cost, which the second return reports rather than dividing.
func BuildCostPerItem(row models.ArchivedJobStats) (float64, bool) {
	if row.TotalProduced <= 0 {
		return 0, false
	}
	return row.CostParts().Build() / row.TotalProduced, true
}

// CountsTowardBuildHistory reports whether a row is one of the builds the marks
// are drawn from. Chain intermediates count: they were built, and the timeline
// plots them in buckets of their own.
func CountsTowardBuildHistory(row models.ArchivedJobStats) bool {
	return !row.Revoked
}

// BuildHistory reduces one item type's rows to the marks a build history
// is read from.
//
// Ordered by cost month, the same basis the timeline plots. Archive dates order
// rows by when they were written, which on imported history bears no relation to
// when the builds happened.
func BuildHistory(rows []models.ArchivedJobStats) models.BuildHistoryMarks {
	var (
		out                                    models.BuildHistoryMarks
		firstID, lastID, cheapestID, dearestID string
	)

	for _, row := range rows {
		if !CountsTowardBuildHistory(row) {
			continue
		}
		perItem, ok := BuildCostPerItem(row)
		if !ok {
			continue
		}

		month := costMonthOf(row)
		out.BuildCount++

		if firstID == "" || monthBefore(month, row.JobID, out.FirstCostMonth, firstID) {
			out.FirstCostMonth, firstID = month, row.JobID
		}
		if lastID == "" || monthBefore(out.LastCostMonth, lastID, month, row.JobID) {
			out.LastCostMonth, lastID = month, row.JobID
			out.LastCostPerItem = perItem
		}
		if cheapestID == "" || costBefore(perItem, row.JobID, out.CheapestCostPerItem, cheapestID) {
			out.CheapestCostPerItem, out.CheapestCostMonth, cheapestID = perItem, month, row.JobID
		}
		if dearestID == "" || costBefore(out.DearestCostPerItem, dearestID, perItem, row.JobID) {
			out.DearestCostPerItem, out.DearestCostMonth, dearestID = perItem, month, row.JobID
		}
	}

	return out
}

// monthBefore and costBefore order builds totally, falling back to the job id so
// two builds sharing a month or a cost still resolve the same way on every run.
func monthBefore(a models.CalendarMonth, aJobID string, b models.CalendarMonth, bJobID string) bool {
	if a != b {
		return a.Before(b)
	}
	return aJobID < bJobID
}

func costBefore(aCost float64, aJobID string, bCost float64, bJobID string) bool {
	if aCost != bCost {
		return aCost < bCost
	}
	return aJobID < bJobID
}
