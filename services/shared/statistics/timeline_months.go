package statistics

import (
	"maps"
	"slices"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
)

// AccumulateBuckets folds an owner's statistics rows into monthly buckets
// keyed by item type and calendar month.
//
// A row contributes to more than one month when its sales and its costs fall
// either side of a boundary: sale lines land in the month they occurred, while
// production costs land in the job's cost month. That is the point of pinning a
// cost month on the row rather than deriving it here.
//
// Revoked rows are skipped: they describe a job that is no longer archived, and
// they are kept rather than deleted only so a rebuild can tell "removed" from
// "never seen".
//
// Production-chain intermediates get buckets of their own. Their costs are also
// counted through the parent job that consumed them, so a view summing across
// item types reads the direct buckets alone; a view scoped to one item reads
// both, which is the whole history for an item only ever built as an
// intermediate.
func AccumulateBuckets(docs []models.ArchivedJobStats) map[models.StatsBucketKey]models.StatsBucketDelta {
	buckets := make(map[models.StatsBucketKey]models.StatsBucketDelta)
	var touched map[models.StatsBucketKey]struct{}

	// A row reaches several buckets — one per sale month, one per fee month, one
	// for its cost month — but counts as a single contributor to each, so the
	// count follows the row rather than the number of measures added.
	add := func(key models.StatsBucketKey, measures models.SalesMeasures) {
		held := buckets[key]
		held.Measures = held.Measures.Plus(measures)
		if _, seen := touched[key]; !seen {
			touched[key] = struct{}{}
			held.Rows++
		}
		buckets[key] = held
	}

	for _, doc := range docs {
		if doc.Revoked {
			continue
		}
		chain := doc.IsProductionChain
		touched = make(map[models.StatsBucketKey]struct{})

		for _, line := range doc.TransactionLines {
			add(models.StatsBucketKey{TypeID: doc.TypeID, IsProductionChain: chain, CalendarMonth: line.CalendarMonth}, models.SalesMeasures{
				TransactionCount:    1,
				QuantitySold:        line.Quantity,
				SalesTotal:          line.Amount,
				TransactionFeeTotal: line.Tax,
				ProfitLoss:          line.Amount - line.Tax,
			})
		}

		for _, line := range doc.FeeLines {
			add(models.StatsBucketKey{TypeID: doc.TypeID, IsProductionChain: chain, CalendarMonth: line.CalendarMonth}, models.SalesMeasures{
				BrokersFeeTotal: line.Amount,
				ProfitLoss:      -line.Amount,
			})
		}

		// The two fees are absent: a bucket carries them as its own measures, in
		// the months they fell, and subtracts them from profit there.
		cost := doc.CostParts().Build()
		add(models.StatsBucketKey{TypeID: doc.TypeID, IsProductionChain: chain, CalendarMonth: costMonthOf(doc)}, models.SalesMeasures{
			JobCostTotal: cost,
			ProfitLoss:   -cost,
			// Filed with the cost that paid for it, so cost per unit divides two
			// figures from the same month.
			QuantityProduced: doc.TotalProduced,
			// Components of that cost, carried alongside it. They do not sum to
			// jobCostTotal: extras are counted per category instead.
			MaterialCostTotal:   doc.TotalMaterialCost,
			InventionCostTotal:  doc.TotalInventionCost,
			InstallCostTotal:    doc.TotalInstallCost,
			ExtrasTotal:         doc.TotalExtras,
			ExtraCategoryTotals: extraCategoryAmounts(doc.ExtraCategories),
			ExtraCategoryLabels: extraCategoryNames(doc.ExtraCategories),
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

// TimelineBuckets renders the folded measures as the documents to persist, sorted
// by identity so a rebuild writes them in a stable order.
func TimelineBuckets(owner models.Owner, docs []models.ArchivedJobStats) []models.TimelineMonthBucket {
	folded := AccumulateBuckets(docs)
	if len(folded) == 0 {
		return nil
	}

	keys := slices.SortedFunc(maps.Keys(folded), func(a, b models.StatsBucketKey) int {
		if a.Year != b.Year {
			return a.Year - b.Year
		}
		if a.Month != b.Month {
			return a.Month - b.Month
		}
		if a.TypeID != b.TypeID {
			return a.TypeID - b.TypeID
		}
		// Direct builds before the chain bucket of the same month and type.
		if a.IsProductionChain == b.IsProductionChain {
			return 0
		}
		if b.IsProductionChain {
			return -1
		}
		return 1
	})

	out := make([]models.TimelineMonthBucket, 0, len(keys))
	for _, key := range keys {
		out = append(out, models.TimelineMonthBucket{
			ID:                eipmongo.TimelineMonthDocumentID(owner, key.TypeID, key.Year, key.Month, key.IsProductionChain),
			Owner:             owner,
			TypeID:            key.TypeID,
			IsProductionChain: key.IsProductionChain,
			CalendarMonth:     key.CalendarMonth,
			SalesMeasures:     folded[key].Measures,
			ContributingRows:  folded[key].Rows,
		})
	}
	return out
}

// extraCategoryAmounts reduces a row's extras entries to the id-to-amount map the
// monthly buckets sum.
func extraCategoryAmounts(entries []models.ArchivedExtraCategory) map[string]float64 {
	if len(entries) == 0 {
		return nil
	}
	out := make(map[string]float64, len(entries))
	for _, entry := range entries {
		out[entry.ID] += entry.Amount
	}
	return out
}

// extraCategoryNames carries the names off a row and into the bucket, so a month
// can be read without the settings document its ids would otherwise need.
//
// An entry with no name contributes none rather than an empty one, which would
// claim the category is called nothing.
func extraCategoryNames(entries []models.ArchivedExtraCategory) map[string]string {
	var out map[string]string
	for _, entry := range entries {
		if entry.Label == "" {
			continue
		}
		if out == nil {
			out = make(map[string]string, len(entries))
		}
		out[entry.ID] = entry.Label
	}
	return out
}
