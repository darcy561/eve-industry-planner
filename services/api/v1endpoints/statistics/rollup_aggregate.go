package statistics

import (
	"sort"

	"eve-industry-planner/shared/models"
)

type rollupAcc struct {
	transactionCount    int64
	quantitySold        float64
	salesTotal          float64
	transactionFeeTotal float64
	brokersFeeTotal     float64
	profitLoss          float64
}

func (a *rollupAcc) addTxn(t models.ArchivedJobTransactionLine) {
	a.transactionCount++
	a.quantitySold += t.Quantity
	a.salesTotal += t.Amount
	a.transactionFeeTotal += t.Tax
	a.profitLoss += t.Profit
}

func (a *rollupAcc) addFee(f models.ArchivedJobFeeLine) {
	a.brokersFeeTotal += f.Amount
	a.profitLoss -= f.Amount
}

func (a *rollupAcc) toTotals() models.BuildStatsRollupTotals {
	return models.BuildStatsRollupTotals{
		TransactionCount:    a.transactionCount,
		QuantitySold:        a.quantitySold,
		SalesTotal:          a.salesTotal,
		TransactionFeeTotal: a.transactionFeeTotal,
		BrokersFeeTotal:     a.brokersFeeTotal,
		ProfitLoss:          a.profitLoss,
	}
}

// aggregateRollupFromArchivedDocs sums tx/fee lines whose calendar month falls inside window (same rules as timeline: per line).
func aggregateRollupFromArchivedDocs(docs []models.ArchivedJobStats, window rollupWindow) (totals models.BuildStatsRollupTotals, byType []models.BuildStatsRollupByType) {
	byTypeMap := make(map[int]*rollupAcc)
	var grand rollupAcc

	for _, doc := range docs {
		tid := doc.TypeID
		typeAcc := byTypeMap[tid]
		if typeAcc == nil {
			typeAcc = &rollupAcc{}
			byTypeMap[tid] = typeAcc
		}
		for _, t := range doc.TransactionLines {
			if !window.contains(t.Year, t.Month) {
				continue
			}
			typeAcc.addTxn(t)
			grand.addTxn(t)
		}
		for _, f := range doc.FeeLines {
			if !window.contains(f.Year, f.Month) {
				continue
			}
			typeAcc.addFee(f)
			grand.addFee(f)
		}
	}

	totals = grand.toTotals()
	typeIDs := make([]int, 0, len(byTypeMap))
	for id := range byTypeMap {
		typeIDs = append(typeIDs, id)
	}
	sort.Ints(typeIDs)
	byType = make([]models.BuildStatsRollupByType, 0, len(typeIDs))
	for _, id := range typeIDs {
		byType = append(byType, models.BuildStatsRollupByType{
			TypeID:                 id,
			BuildStatsRollupTotals: byTypeMap[id].toTotals(),
		})
	}
	return totals, byType
}
