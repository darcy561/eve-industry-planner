package archivestats

import (
	"time"

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

// AccountBuildHistory reduces one item type's rows to the marks a current
// estimate is compared against.
func AccountBuildHistory(rows []models.ArchivedJobStats) models.BuildHistoryMarks {
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

		at := row.ArchivedAt.UTC()
		out.BuildCount++

		if firstID == "" || buildBefore(at, row.JobID, out.FirstBuildAt, firstID) {
			out.FirstBuildAt, firstID = at, row.JobID
		}
		if lastID == "" || buildBefore(out.LastBuildAt, lastID, at, row.JobID) {
			out.LastBuildAt, lastID = at, row.JobID
			out.LastCostPerItem = perItem
		}
		if cheapestID == "" || costBefore(perItem, row.JobID, out.CheapestCostPerItem, cheapestID) {
			out.CheapestCostPerItem, out.CheapestBuildAt, cheapestID = perItem, at, row.JobID
		}
		if dearestID == "" || costBefore(out.DearestCostPerItem, dearestID, perItem, row.JobID) {
			out.DearestCostPerItem, out.DearestBuildAt, dearestID = perItem, at, row.JobID
		}
	}

	return out
}

// buildBefore and costBefore order builds totally, falling back to the job id so
// two builds sharing a timestamp or a cost still resolve the same way on every
// run.
func buildBefore(aAt time.Time, aJobID string, bAt time.Time, bJobID string) bool {
	if !aAt.Equal(bAt) {
		return aAt.Before(bAt)
	}
	return aJobID < bJobID
}

func costBefore(aCost float64, aJobID string, bCost float64, bJobID string) bool {
	if aCost != bCost {
		return aCost < bCost
	}
	return aJobID < bJobID
}
