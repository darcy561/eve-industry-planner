package helpers

import "eve-industry-planner/shared/models"

// NetArchivedProfitLoss is headline economics for Mongo build_stats / corp_build_stats lifetime rows
// and segment breakdowns: sales − broker fees − transaction fees − total job cost (same basis as
// Blueprint Archive combined totals).
func NetArchivedProfitLoss(salesTotal, brokersFeeTotal, transactionFeeTotal, jobCostTotal float64) float64 {
	return salesTotal - brokersFeeTotal - transactionFeeTotal - jobCostTotal
}

// NetArchivedProfitLossFromTotals applies NetArchivedProfitLoss to aggregated segment or row totals.
func NetArchivedProfitLossFromTotals(t models.BuildStatsSegmentTotals) float64 {
	return NetArchivedProfitLoss(t.SalesTotal, t.BrokersFeeTotal, t.TransactionFeeTotal, t.JobCostTotal)
}
