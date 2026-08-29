package archivedjobs

import (
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/models"
)

func TestComputeBuildStatSnapshot_matchesArchivedJobsMath(t *testing.T) {
	job := models.Job{
		JobID:   "job-test-1",
		ItemID:  34,
		JobType: 1,
		Build: models.JobBuild{
			Products: models.JobProducts{TotalQuantity: 10},
			Costs: models.JobCosts{
				TotalPurchaseCost: 100,
				InstallCosts:      5,
				ExtrasTotal:       3,
				InventionCosts:    2,
				LinkedJobs: []models.LinkedESIJob{
					{IsCorporation: false},
					{IsCorporation: true},
				},
			},
			Sale: models.JobSale{
				BrokersFee: []models.BrokerFee{{Amount: 1.5}},
				Transactions: []models.Transaction{
					{Tax: 0.5, Amount: 80, Quantity: 8},
					{Tax: 0.25, Amount: 40, Quantity: 2},
				},
				MarketOrders: []models.MarketOrder{
					{IsCorporation: false},
					{IsCorporation: true},
				},
			},
		},
	}

	snap, err := computeBuildStatSnapshot(job)
	if err != nil {
		t.Fatal(err)
	}

	if snap.TotalBuildCosts != 108 {
		t.Fatalf("TotalBuildCosts: got %v want 108", snap.TotalBuildCosts)
	}
	if snap.TotalJobCost != 110.25 {
		t.Fatalf("TotalJobCost: got %v want 110.25", snap.TotalJobCost)
	}
	if snap.TotalSales != 120 {
		t.Fatalf("TotalSales: got %v", snap.TotalSales)
	}
	if snap.AverageSalePrice != 12 {
		t.Fatalf("AverageSalePrice: got %v want 12", snap.AverageSalePrice)
	}
	if snap.ProfitLoss != (120 - 110.25) {
		t.Fatalf("ProfitLoss: got %v", snap.ProfitLoss)
	}
	if snap.TotalCostPerItem != 11.03 {
		t.Fatalf("TotalCostPerItem: got %v want 11.03", snap.TotalCostPerItem)
	}
}

func TestComputeBuildStatSnapshot_zeroQuantityErrors(t *testing.T) {
	_, err := computeBuildStatSnapshot(models.Job{
		JobID: "x",
		Build: models.JobBuild{Products: models.JobProducts{TotalQuantity: 0}},
	})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestAccountProductionTotalsDocumentID(t *testing.T) {
	if g, w := eipmongo.AccountProductionTotalsDocumentID("acc", 34), "acc|34"; g != w {
		t.Fatalf("got %q want %q", g, w)
	}
}
