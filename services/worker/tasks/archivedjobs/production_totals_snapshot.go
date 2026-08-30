package archivedjobs

import (
	"fmt"
	"math"
	"time"

	"eve-industry-planner/shared/models"
)

const buildStatRoundEps = 1e-9

func roundBuildStatMoney(x float64) float64 {
	return math.Round((x+buildStatRoundEps)*100) / 100
}

// computeBuildStatSnapshot mirrors frontend/functions archivedJobs.js reducers and arithmetic.
func computeBuildStatSnapshot(job models.Job) (models.BuildStatSnapshot, error) {
	totalProduced := float64(job.Build.Products.TotalQuantity)
	if totalProduced <= 0 {
		return models.BuildStatSnapshot{}, fmt.Errorf("build.products.totalQuantity must be > 0 (jobID=%s)", job.JobID)
	}

	totalSale := 0.0
	averageQuantity := 0.0
	for _, item := range job.Build.Sale.Transactions {
		totalSale += item.Amount
		averageQuantity += float64(item.Quantity)
	}

	cost := job.CostParts()
	materialCostPerItem := cost.Materials / totalProduced
	totalJobCost := cost.Total()
	totalCostPerItem := roundBuildStatMoney(totalJobCost / totalProduced)

	averageSalePrice := 0.0
	if averageQuantity > 0 {
		averageSalePrice = roundBuildStatMoney(totalSale / averageQuantity)
	}

	profitLoss := 0.0
	if totalSale > 0 {
		profitLoss = totalSale - totalJobCost
	}

	return models.BuildStatSnapshot{
		TypeID:              job.ItemID,
		JobID:               job.JobID,
		JobType:             job.JobType,
		ProcessDate:         time.Now().UTC().UnixMilli(),
		TotalProduced:       totalProduced,
		TotalMaterialCost:   cost.Materials,
		MaterialCostPerItem: materialCostPerItem,
		TotalInventionCost:  cost.Invention,
		TotalInstallCost:    cost.Install,
		TotalExtras:         cost.Extras,
		BrokersFeeTotal:     cost.BrokersFee,
		TransactionFeeTotal: cost.TransactionFee,
		TotalJobCost:        totalJobCost,
		TotalCostPerItem:    totalCostPerItem,
		TotalSales:          totalSale,
		AverageSalePrice:    averageSalePrice,
		ProfitLoss:          profitLoss,
	}, nil
}
