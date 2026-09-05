package archivestats

import (
	"maps"
	"slices"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// ProductionTotals folds an owner's per-job rows into one lifetime
// aggregate per item type.
//
// These are the documents the lifetime totals read serves. A wholesale rebuild
// recomputes every total from the rows, so running it twice cannot double-count.
func ProductionTotals(
	owner models.Owner,
	rows []models.ArchivedJobStats,
) []models.ProductionTotalsRow {
	if owner.IsZero() || len(rows) == 0 {
		return nil
	}

	byType := make(map[int]*models.ProductionTotalsRow)
	marksRows := make(map[int][]models.ArchivedJobStats)

	for _, row := range rows {
		if row.Revoked {
			// A revoked row describes a job that is no longer archived. Its
			// figures were counted while it existed and must not be now.
			continue
		}

		total, ok := byType[row.TypeID]
		if !ok {
			total = &models.ProductionTotalsRow{
				ID:     eipmongo.ProductionTotalsDocumentID(owner, row.TypeID),
				Owner:  owner,
				TypeID: row.TypeID,
			}
			byType[row.TypeID] = total
		}
		if total.JobType == 0 {
			total.JobType = row.JobType
		}

		measures := JobMeasures(row)
		total.BuildMeasures = total.BuildMeasures.Plus(measures)
		addSegment(&total.Breakdown, row, measures)
		marksRows[row.TypeID] = append(marksRows[row.TypeID], row)
	}

	out := make([]models.ProductionTotalsRow, 0, len(byType))
	for _, typeID := range slices.Sorted(maps.Keys(byType)) {
		total := byType[typeID]
		total.History = BuildHistory(marksRows[typeID])
		out = append(out, *total)
	}
	return out
}

// JobMeasures reduces one archived job row to the lifetime measures it adds.
// Exported so a view can label a job with the same figures the totals counted.
//
// The definitions here match what the per-job snapshot contributed, because
// these documents are read by a client that has been served those figures all
// along. Two of them are easy to restate wrongly:
//
//   - jobCostTotal is build costs **plus** both fee totals, not build costs
//     alone. The fees appear as their own measures as well, so a caller must not
//     subtract them from jobCostTotal a second time.
//   - profitLoss is sales − jobCostTotal, which therefore already accounts for
//     the fees exactly once. Recomputing it as
//     sales − brokers − transaction − jobCostTotal would subtract them twice.
//
// profitLoss is zero when nothing sold, rather than a negative figure equal to
// the build cost: an unsold build has not lost money, it has not realised any.
func JobMeasures(row models.ArchivedJobStats) models.BuildMeasures {
	cost := row.CostParts()
	sales := row.SalesTotal()

	// A job with no sale has no profit to report, rather than a loss the size of
	// its cost: it has not been sold yet.
	profitLoss := 0.0
	if sales > 0 {
		profitLoss = sales - cost.Total()
	}

	return models.BuildMeasures{
		TotalJobs:           1,
		ItemBuildCount:      row.TotalProduced,
		BuildCostTotal:      cost.Build(),
		BrokersFeeTotal:     cost.BrokersFee,
		TransactionFeeTotal: cost.TransactionFee,
		JobCostTotal:        cost.Total(),
		SalesTotal:          sales,
		ProfitLoss:          profitLoss,
	}
}

// addSegment credits a job to exactly one segment of the breakdown.
//
// The segments are a closed classification and a job belongs to one of them:
// an intermediate consumed by a parent build, a build whose output was sold, or
// output that left no sale behind. Crediting more than one would double-count
// the same job inside a single document.
//
// Market is decided by evidence rather than by elimination. A sale is a
// transaction line, whoever wrote it: ESI records market transactions, and a
// contract or other off-market sale is entered by hand as a custom transaction
// carrying the same quantity, amount and tax. Both reach this point as
// TransactionLines, so both count.
//
// A broker fee counts too. Listing output on the market is market activity even
// before anything sells, and a fee-only job sent to stock would show a broker fee
// total in a block that suppresses the fee row explaining it. Lines are weighed
// by their figures rather than their presence, so a placeholder carrying nothing
// is not evidence of anything.
//
// Everything left over is stock. Falling the other way — treating "not a chain
// step" as sold — put every unsold build under Market with nothing but zeros for
// sales and fees, which read as a market sale that had somehow earned nothing.
//
// Stock here means the whole job left no sale behind, which is a different
// question from how much of what a job produced is still held: a job that sold
// most of a run counts entirely as a sale. That quantity is derived from
// QuantityProduced and QuantitySold rather than classified here, because nothing
// can match a stack in a hangar to the job that built it.

// JobSegment names the segment a job is credited to.
//
// The classification is a closed set and a job belongs to exactly one of its
// members; exported so a view can label a job with the same answer the breakdown
// counted it under.
func JobSegment(row models.ArchivedJobStats) string {
	switch {
	case row.IsProductionChain:
		return models.ArchiveSegmentProductionChain
	case hasRecordedMarketActivity(row):
		return models.ArchiveSegmentStandaloneRecordedSale
	default:
		return models.ArchiveSegmentRetainedStock
	}
}

func addSegment(breakdown *models.ProductionTotalsBreakdown, row models.ArchivedJobStats, measures models.BuildMeasures) {
	var sold float64
	for _, line := range row.TransactionLines {
		sold += line.Quantity
	}
	segment := models.ArchiveSegmentTotals{BuildMeasures: measures, TotalSoldQuantity: sold}

	switch {
	case row.IsProductionChain:
		breakdown.ProductionChain = breakdown.ProductionChain.Plus(segment)
	case hasRecordedMarketActivity(row):
		breakdown.StandaloneRecordedSale = breakdown.StandaloneRecordedSale.Plus(segment)
	default:
		breakdown.RetainedStock = breakdown.RetainedStock.Plus(segment)
	}
}

// hasRecordedMarketActivity reports whether a row carries evidence its output
// met the market: a sale of any size, or a broker fee paid to list it.
//
// Zero-valued lines are not evidence. A line carrying neither an amount nor a
// quantity records no money and no goods, so it says nothing about whether the
// job sold.
func hasRecordedMarketActivity(row models.ArchivedJobStats) bool {
	for _, line := range row.TransactionLines {
		if line.Amount != 0 || line.Quantity != 0 {
			return true
		}
	}
	for _, line := range row.FeeLines {
		if line.Amount != 0 {
			return true
		}
	}
	return false
}
