package archivestats

import (
	"maps"
	"slices"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// AccountProductionTotals folds an account's per-job rows into one lifetime
// aggregate per item type.
//
// These are the documents the lifetime totals read serves. They were previously
// produced by a separate worker that walked unprocessed archived jobs and
// applied `$inc` per job, marking each one processed so it was never counted
// twice. Deriving them from the same rows the rest of the pipeline uses removes
// that second producer, and with it the need for a processed flag: a wholesale
// rebuild recomputes every total from scratch, so running it twice cannot
// double-count.
//
// snapshots supplies the per-job history each row carries, keyed by job id. A
// job with no snapshot still contributes its totals; the history is additive
// detail, not the source of the measures.
func AccountProductionTotals(
	accountID string,
	rows []models.ArchivedJobStats,
	snapshots map[string]models.BuildStatSnapshot,
) []models.BuildStatsRow {
	if accountID == "" || len(rows) == 0 {
		return nil
	}

	byType := make(map[int]*models.BuildStatsRow)
	history := make(map[int][]models.BuildStatSnapshot)

	for _, row := range rows {
		if row.Revoked {
			// A revoked row describes a job that is no longer archived. Its
			// figures were counted while it existed and must not be now.
			continue
		}

		total, ok := byType[row.TypeID]
		if !ok {
			total = &models.BuildStatsRow{
				ID:        eipmongo.AccountProductionTotalsDocumentID(accountID, row.TypeID),
				AccountID: accountID,
				TypeID:    row.TypeID,
			}
			byType[row.TypeID] = total
		}
		if total.JobType == 0 {
			total.JobType = row.JobType
		}

		measures := jobMeasures(row)
		total.BuildMeasures = total.BuildMeasures.Plus(measures)
		addSegment(&total.Breakdown, row, measures)

		if snap, ok := snapshots[row.JobID]; ok {
			history[row.TypeID] = append(history[row.TypeID], snap)
		}
	}

	out := make([]models.BuildStatsRow, 0, len(byType))
	for _, typeID := range slices.Sorted(maps.Keys(byType)) {
		total := byType[typeID]
		snaps := history[typeID]
		// Ordered by the moment each job was reduced, so a rebuild produces the
		// same array every time rather than one that reflects map iteration.
		slices.SortFunc(snaps, func(a, b models.BuildStatSnapshot) int {
			if a.ProcessDate != b.ProcessDate {
				if a.ProcessDate < b.ProcessDate {
					return -1
				}
				return 1
			}
			return compareStrings(a.JobID, b.JobID)
		})
		if snaps == nil {
			// Serialised as [] rather than null: the read returns an empty array
			// for an account with no history, and a rebuilt row must match.
			snaps = []models.BuildStatSnapshot{}
		}
		total.DataSnapshots = snaps
		out = append(out, *total)
	}
	return out
}

// jobMeasures reduces one archived job row to the lifetime measures it adds.
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
func jobMeasures(row models.ArchivedJobStats) models.BuildMeasures {
	var sales, brokersFee, transactionFee float64
	for _, line := range row.TransactionLines {
		sales += line.Amount
		transactionFee += line.Tax
	}
	for _, line := range row.FeeLines {
		brokersFee += line.Amount
	}

	jobCost := row.TotalBuildCosts + brokersFee + transactionFee

	profitLoss := 0.0
	if sales > 0 {
		profitLoss = sales - jobCost
	}

	return models.BuildMeasures{
		TotalJobs:           1,
		ItemBuildCount:      row.TotalProduced,
		BuildCostTotal:      row.TotalBuildCosts,
		BrokersFeeTotal:     brokersFee,
		TransactionFeeTotal: transactionFee,
		JobCostTotal:        jobCost,
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
// Everything left over is stock. Falling the other way — treating "not a chain
// step and not flagged" as sold — put every unsold build under Market with
// nothing but zeros for sales and fees, which read as a market sale that had
// somehow earned nothing. RetainedStockBuild still routes a job here explicitly,
// so a user marking output as kept is honoured whether or not it ever sold.
func addSegment(breakdown *models.BuildStatsBreakdown, row models.ArchivedJobStats, measures models.BuildMeasures) {
	var sold float64
	for _, line := range row.TransactionLines {
		sold += line.Quantity
	}
	segment := models.BuildStatsSegmentTotals{BuildMeasures: measures, TotalSoldQuantity: sold}

	switch {
	case row.IsProductionChain:
		breakdown.ProductionChain = breakdown.ProductionChain.Plus(segment)
	case len(row.TransactionLines) > 0 && !row.RetainedStockBuild:
		breakdown.StandaloneRecordedSale = breakdown.StandaloneRecordedSale.Plus(segment)
	default:
		breakdown.RetainedStock = breakdown.RetainedStock.Plus(segment)
	}
}

func compareStrings(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	default:
		return 0
	}
}
