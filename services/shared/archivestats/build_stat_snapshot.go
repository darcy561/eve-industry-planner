package archivestats

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

// BuildStatSnapshotFor mirrors frontend/functions archivedJobs.js reducers and arithmetic.
func BuildStatSnapshotFor(job models.Job) (models.BuildStatSnapshot, error) {
	totalProduced := float64(job.TotalQuantityProduced())
	if totalProduced <= 0 {
		return models.BuildStatSnapshot{}, fmt.Errorf("the setups produce nothing (jobID=%s)", job.JobID)
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

// NewRow derives the statistics row for one archived job, computing the snapshot
// it reduces. [RowFromSnapshot] is the same reduction where one is already to hand.
//
// The row is the unit everything above it is folded from, and it is derived from
// the job alone — so it can be written wherever the job is, rather than found
// again later by a reader that has to work out which jobs lack one.
//
// Returned uncounted: see [RowFromSnapshot].
func NewRow(job models.Job, now time.Time) (models.ArchivedJobStats, error) {
	snap, err := BuildStatSnapshotFor(job)
	if err != nil {
		return models.ArchivedJobStats{}, err
	}
	return RowFromSnapshot(job, snap, now), nil
}
