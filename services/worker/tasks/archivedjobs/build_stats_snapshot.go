package archivedjobs

import (
	"fmt"
	"time"

	"eve-industry-planner/shared/core/moneyutil"
	"eve-industry-planner/shared/shared/models"

	"go.mongodb.org/mongo-driver/bson"
)

// computeBuildStatSnapshot mirrors frontend/functions archievedJobs.js reducers and arithmetic.
func computeBuildStatSnapshot(job models.Job) (models.BuildStatSnapshot, error) {
	totalProduced := float64(job.Build.Products.TotalQuantity)
	if totalProduced <= 0 {
		return models.BuildStatSnapshot{}, fmt.Errorf("build.products.totalQuantity must be > 0 (jobID=%s)", job.JobID)
	}

	brokersFeesTotal := 0.0
	for _, item := range job.Build.Sale.BrokersFee {
		brokersFeesTotal += item.Amount
	}

	transactionFeeTotal := 0.0
	totalSale := 0.0
	averageQuantity := 0.0
	for _, item := range job.Build.Sale.Transactions {
		transactionFeeTotal += item.Tax
		totalSale += item.Amount
		averageQuantity += float64(item.Quantity)
	}

	totalMaterialCost := job.Build.Costs.TotalPurchaseCost
	materialCostPerItem := totalMaterialCost / totalProduced
	totalInventionCost := job.Build.Costs.InventionCosts
	totalInstallCost := job.Build.Costs.InstallCosts
	totalExtras := job.Build.Costs.ExtrasTotal
	totalBuildCosts := totalMaterialCost + totalInstallCost + totalExtras
	totalJobCost := totalBuildCosts + brokersFeesTotal + transactionFeeTotal
	totalCostPerItem := moneyutil.Round2(totalJobCost / totalProduced)

	averageSalePrice := 0.0
	if averageQuantity > 0 {
		averageSalePrice = moneyutil.Round2(totalSale / averageQuantity)
	}

	profitLoss := 0.0
	if totalSale > 0 {
		profitLoss = totalSale - totalJobCost
	}

	corpMarketOrder := false
	for _, order := range job.Build.Sale.MarketOrders {
		if order.IsCorporation {
			corpMarketOrder = true
			break
		}
	}

	corpIndustryJob := false
	for _, linked := range job.Build.Costs.LinkedJobs {
		if linked.IsCorporation {
			corpIndustryJob = true
			break
		}
	}

	return models.BuildStatSnapshot{
		TypeID:              job.ItemID,
		JobID:               job.JobID,
		JobType:             job.JobType,
		ProcessDate:         time.Now().UTC().UnixMilli(),
		TotalProduced:       totalProduced,
		TotalMaterialCost:   totalMaterialCost,
		MaterialCostPerItem: materialCostPerItem,
		TotalInventionCost:  totalInventionCost,
		TotalInstallCost:    totalInstallCost,
		TotalExtras:         totalExtras,
		TotalBuildCosts:     totalBuildCosts,
		BrokersFeeTotal:     brokersFeesTotal,
		TransactionFeeTotal: transactionFeeTotal,
		TotalJobCost:        totalJobCost,
		TotalCostPerItem:    totalCostPerItem,
		TotalSales:          totalSale,
		AverageSalePrice:    averageSalePrice,
		ProfitLoss:          profitLoss,
		CorpMarketOrder:     corpMarketOrder,
		CorpIndustryJob:     corpIndustryJob,
	}, nil
}

// buildStatSnapshotIncUpdate returns per-job deltas for build_stats — use only with Update $inc
// so totals accumulate across all processed archived jobs for this account+item row.
func buildStatSnapshotIncUpdate(s models.BuildStatSnapshot) bson.M {
	return bson.M{
		"totalJobs":           1,
		"itemBuildCount":      s.TotalProduced,
		"buildCostTotal":      s.TotalBuildCosts,
		"brokersFeeTotal":     s.BrokersFeeTotal,
		"transactionFeeTotal": s.TransactionFeeTotal,
		"jobCostTotal":        s.TotalJobCost,
		"salesTotal":          s.TotalSales,
		"profitLoss":          s.ProfitLoss,
	}
}
