package archivestats

import (
	"maps"
	"slices"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// BucketKey identifies one monthly rollup bucket: an item type in a calendar month.
type BucketKey struct {
	TypeID int
	models.CalendarMonth
}

// jobBuildCost is what a job contributes to a bucket's cost total.
//
// TotalBuildCosts already covers materials, install and extras; invention is the
// one component it excludes, so the two sum to the whole production cost without
// counting anything twice. Broker and transaction fees are deliberately absent —
// a bucket carries those in their own measures, and folding them in here would
// count them against profit twice.
func jobBuildCost(doc models.ArchivedJobStats) float64 {
	return doc.TotalBuildCosts + doc.TotalInventionCost
}

// AccumulateAccountBuckets folds an account's statistics rows into monthly buckets
// keyed by item type and calendar month.
//
// A row contributes to more than one month when its sales and its costs fall
// either side of a boundary: sale lines land in the month they occurred, while
// production costs land in the job's cost month. That is the point of pinning a
// cost month on the row rather than deriving it here.
//
// Revoked rows are skipped: they describe a job that is no longer archived, and
// they are kept rather than deleted only so a rebuild can tell "removed" from
// "never seen". Production-chain intermediates are skipped too — their costs and
// output are already counted through the parent job that consumed them, so
// including them would count the same build twice.
func AccumulateAccountBuckets(docs []models.ArchivedJobStats) map[BucketKey]models.SalesMeasures {
	buckets := make(map[BucketKey]models.SalesMeasures)

	add := func(key BucketKey, measures models.SalesMeasures) {
		buckets[key] = buckets[key].Plus(measures)
	}

	for _, doc := range docs {
		if doc.Revoked || doc.IsProductionChain {
			continue
		}

		for _, line := range doc.TransactionLines {
			add(BucketKey{TypeID: doc.TypeID, CalendarMonth: line.CalendarMonth}, models.SalesMeasures{
				TransactionCount:    1,
				QuantitySold:        line.Quantity,
				SalesTotal:          line.Amount,
				TransactionFeeTotal: line.Tax,
				ProfitLoss:          line.Amount - line.Tax,
			})
		}

		for _, line := range doc.FeeLines {
			add(BucketKey{TypeID: doc.TypeID, CalendarMonth: line.CalendarMonth}, models.SalesMeasures{
				BrokersFeeTotal: line.Amount,
				ProfitLoss:      -line.Amount,
			})
		}

		cost := jobBuildCost(doc)
		add(BucketKey{TypeID: doc.TypeID, CalendarMonth: costMonthOf(doc)}, models.SalesMeasures{
			JobCostTotal:        cost,
			ProfitLoss:          -cost,
			ExtraCategoryTotals: maps.Clone(doc.ExtraCategoryTotals),
		})
	}

	return buckets
}

// costMonthOf reads the month pinned on the row, falling back to when the job was
// archived. A row written before the month was pinned still has to land somewhere,
// and its archive date is the closest thing to when its costs were incurred.
func costMonthOf(doc models.ArchivedJobStats) models.CalendarMonth {
	if doc.CostMonth.Year > 0 && doc.CostMonth.Month >= 1 && doc.CostMonth.Month <= 12 {
		return doc.CostMonth
	}
	return monthOf(doc.ArchivedAt)
}

// AccountBuckets renders the folded measures as the documents to persist, sorted
// by identity so a rebuild writes them in a stable order.
func AccountBuckets(accountID string, docs []models.ArchivedJobStats) []models.UserRollupMonthlyBucket {
	folded := AccumulateAccountBuckets(docs)
	if len(folded) == 0 {
		return nil
	}

	keys := slices.SortedFunc(maps.Keys(folded), func(a, b BucketKey) int {
		if a.Year != b.Year {
			return a.Year - b.Year
		}
		if a.Month != b.Month {
			return a.Month - b.Month
		}
		return a.TypeID - b.TypeID
	})

	out := make([]models.UserRollupMonthlyBucket, 0, len(keys))
	for _, key := range keys {
		out = append(out, models.UserRollupMonthlyBucket{
			ID:            eipmongo.UserRollupMonthlyDocumentID(accountID, key.TypeID, key.Year, key.Month),
			AccountID:     accountID,
			TypeID:        key.TypeID,
			CalendarMonth: key.CalendarMonth,
			SalesMeasures: folded[key],
		})
	}
	return out
}
