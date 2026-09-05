package statistics

import (
	"testing"

	"eve-industry-planner/shared/models"
)

func TestComputeBuildStatSnapshot_matchesArchivedJobsMath(t *testing.T) {
	job := models.Job{
		ItemsProducedPerRun: 1,
		JobID:               "job-test-1",
		ItemID:              34,
		JobType:             1,
		Build: models.JobBuild{
			Setup: map[string]models.JobSetup{"s1": {
				ID: "s1", RunCount: 5, JobCount: 2,
				MaterialCount: map[string]models.MaterialCount{
					"34": {TypeID: 34, Quantity: 70},
					"35": {TypeID: 35, Quantity: 30},
				},
			}},
			Materials: []models.JobMaterial{
				{TypeID: 34, Purchasing: []models.Purchase{{ID: "p1", ItemCount: 70, ItemCost: 1}}},
				{TypeID: 35, Purchasing: []models.Purchase{{ID: "p2", ItemCount: 30, ItemCost: 1}}},
			},
			Costs: models.JobCosts{
				ExtrasCosts:      []models.ExtraCost{{ID: "e1", ExtraValue: 3}},
				InventionEntries: []models.InventionEntry{{ID: 1, ItemName: "Datacore", ItemCost: 2}},
				LinkedJobs: []models.LinkedESIJob{
					{IsCorporation: false, Cost: 2},
					{IsCorporation: true, Cost: 3},
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

	snap, err := JobFiguresFor(job)
	if err != nil {
		t.Fatal(err)
	}

	// materials 100 + install 5 + extras 3 + invention 2 + brokers 1.5 + tax 0.75
	if snap.TotalJobCost != 112.25 {
		t.Fatalf("TotalJobCost: got %v want 112.25", snap.TotalJobCost)
	}
	if snap.TotalSales != 120 {
		t.Fatalf("TotalSales: got %v", snap.TotalSales)
	}
	if snap.AverageSalePrice != 12 {
		t.Fatalf("AverageSalePrice: got %v want 12", snap.AverageSalePrice)
	}
	if snap.ProfitLoss != (120 - 112.25) {
		t.Fatalf("ProfitLoss: got %v", snap.ProfitLoss)
	}
	if snap.TotalCostPerItem != 11.23 {
		t.Fatalf("TotalCostPerItem: got %v want 11.23", snap.TotalCostPerItem)
	}
}

func TestComputeBuildStatSnapshot_noSetupsErrors(t *testing.T) {
	_, err := JobFiguresFor(models.Job{JobID: "x"})
	if err == nil {
		t.Fatal("expected error")
	}
}
