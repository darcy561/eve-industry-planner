package statistics

import (
	"sort"

	"go.mongodb.org/mongo-driver/bson"

	"eve-industry-planner/shared/archivestats"
	"eve-industry-planner/shared/models"
)

func mergeExtraCategoryTotals(dst map[string]float64, src map[string]float64) map[string]float64 {
	if len(src) == 0 {
		return dst
	}
	if dst == nil {
		dst = map[string]float64{}
	}
	for id, v := range src {
		if id == "" {
			continue
		}
		dst[id] += v
	}
	return dst
}

func rollupBSONMonthOr(months []archivestats.YearMonth) bson.M {
	or := make(bson.A, 0, len(months))
	for _, p := range months {
		or = append(or, bson.M{"year": p.Year, "month": p.Month})
	}
	return bson.M{"$or": or}
}

func mergeUserRollupBuckets(rows []models.UserRollupMonthlyBucket, typeID *int) (models.BuildStatsRollupTotals, []models.BuildStatsRollupByType) {
	typeIDs := make(map[int]models.BuildStatsRollupTotals)
	var totals models.BuildStatsRollupTotals
	for _, r := range rows {
		totals.TransactionCount += r.TransactionCount
		totals.QuantitySold += r.QuantitySold
		totals.SalesTotal += r.SalesTotal
		totals.JobCostTotal += r.JobCostTotal
		totals.ExtraCategoryTotals = mergeExtraCategoryTotals(totals.ExtraCategoryTotals, r.ExtraCategoryTotals)
		totals.TransactionFeeTotal += r.TransactionFeeTotal
		totals.BrokersFeeTotal += r.BrokersFeeTotal
		totals.ProfitLoss += r.ProfitLoss

		bt := typeIDs[r.TypeID]
		bt.TransactionCount += r.TransactionCount
		bt.QuantitySold += r.QuantitySold
		bt.SalesTotal += r.SalesTotal
		bt.JobCostTotal += r.JobCostTotal
		bt.ExtraCategoryTotals = mergeExtraCategoryTotals(bt.ExtraCategoryTotals, r.ExtraCategoryTotals)
		bt.TransactionFeeTotal += r.TransactionFeeTotal
		bt.BrokersFeeTotal += r.BrokersFeeTotal
		bt.ProfitLoss += r.ProfitLoss
		typeIDs[r.TypeID] = bt
	}
	var byType []models.BuildStatsRollupByType
	if typeID == nil {
		tids := make([]int, 0, len(typeIDs))
		for id := range typeIDs {
			tids = append(tids, id)
		}
		sort.Ints(tids)
		byType = make([]models.BuildStatsRollupByType, 0, len(tids))
		for _, id := range tids {
			t := typeIDs[id]
			byType = append(byType, models.BuildStatsRollupByType{TypeID: id, BuildStatsRollupTotals: t})
		}
	}
	return totals, byType
}

func mergeCorpRollupBuckets(rows []models.CorpRollupMonthlyBucket, typeID *int) (models.BuildStatsRollupTotals, []models.BuildStatsRollupByType) {
	typeIDs := make(map[int]models.BuildStatsRollupTotals)
	var totals models.BuildStatsRollupTotals
	for _, r := range rows {
		totals.TransactionCount += r.TransactionCount
		totals.QuantitySold += r.QuantitySold
		totals.SalesTotal += r.SalesTotal
		totals.JobCostTotal += r.JobCostTotal
		totals.ExtraCategoryTotals = mergeExtraCategoryTotals(totals.ExtraCategoryTotals, r.ExtraCategoryTotals)
		totals.TransactionFeeTotal += r.TransactionFeeTotal
		totals.BrokersFeeTotal += r.BrokersFeeTotal
		totals.ProfitLoss += r.ProfitLoss

		bt := typeIDs[r.TypeID]
		bt.TransactionCount += r.TransactionCount
		bt.QuantitySold += r.QuantitySold
		bt.SalesTotal += r.SalesTotal
		bt.JobCostTotal += r.JobCostTotal
		bt.ExtraCategoryTotals = mergeExtraCategoryTotals(bt.ExtraCategoryTotals, r.ExtraCategoryTotals)
		bt.TransactionFeeTotal += r.TransactionFeeTotal
		bt.BrokersFeeTotal += r.BrokersFeeTotal
		bt.ProfitLoss += r.ProfitLoss
		typeIDs[r.TypeID] = bt
	}
	var byType []models.BuildStatsRollupByType
	if typeID == nil {
		tids := make([]int, 0, len(typeIDs))
		for id := range typeIDs {
			tids = append(tids, id)
		}
		sort.Ints(tids)
		byType = make([]models.BuildStatsRollupByType, 0, len(tids))
		for _, id := range tids {
			t := typeIDs[id]
			byType = append(byType, models.BuildStatsRollupByType{TypeID: id, BuildStatsRollupTotals: t})
		}
	}
	return totals, byType
}
