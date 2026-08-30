package models

import "testing"

// A job's cost is all six components. Invention is the one that has been left
// out before, and it is easy to leave out again: it is the only cost that is not
// per unit and not a fee.
func TestJobCostIsAllSixComponents(t *testing.T) {
	t.Parallel()

	parts := JobCostParts{
		Materials:      100,
		Install:        5,
		Invention:      2,
		Extras:         3,
		BrokersFee:     1.5,
		TransactionFee: 0.75,
	}

	if got := parts.Total(); got != 112.25 {
		t.Fatalf("Total() = %v, want 112.25", got)
	}
}

func TestJobCostPartsAreReadFromTheJob(t *testing.T) {
	t.Parallel()

	job := Job{}
	job.Build.Materials = []JobMaterial{{PurchasedCost: 60}, {PurchasedCost: 40}}
	job.Build.Costs.InstallCosts = 5
	job.Build.Costs.InventionCosts = 2
	job.Build.Costs.ExtrasTotal = 3
	job.Build.Sale.BrokersFee = []BrokerFee{{Amount: 1}, {Amount: 0.5}}
	job.Build.Sale.Transactions = []Transaction{{Tax: 0.5}, {Tax: 0.25}}

	parts := job.CostParts()

	if parts.Materials != 100 {
		t.Errorf("materials = %v, want every purchase summed", parts.Materials)
	}
	if parts.Install != 5 || parts.Invention != 2 || parts.Extras != 3 {
		t.Fatalf("production components misread: %+v", parts)
	}
	if parts.BrokersFee != 1.5 {
		t.Errorf("brokersFee = %v, want every fee summed", parts.BrokersFee)
	}
	if parts.TransactionFee != 0.75 {
		t.Errorf("transactionFee = %v, want every sale's fee summed", parts.TransactionFee)
	}
}
