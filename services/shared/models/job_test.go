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
	job.Build.Costs.LinkedJobs = []LinkedESIJob{{JobID: 1, Cost: 3}, {JobID: 2, Cost: 2}}
	job.Build.Costs.InventionEntries = []InventionEntry{{ID: 1, ItemName: "Datacore", ItemCost: 2}}
	job.Build.Costs.ExtrasCosts = []ExtraCost{{ID: "e1", ExtraValue: 2}, {ID: "e2", ExtraValue: 1}}
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

// A job produces what its setups are set to make. The sum is taken on every
// call, so a setup that is added, removed or resized is reflected at once and
// there is no stored total to fall behind it.
func TestTotalQuantityProducedComesFromTheSetups(t *testing.T) {
	t.Parallel()

	job := Job{ItemsProducedPerRun: 100}
	job.Build.Setup = map[string]JobSetup{
		"s1": {ID: "s1", RunCount: 5, JobCount: 2},
		"s2": {ID: "s2", RunCount: 3, JobCount: 1},
	}

	if got := job.TotalQuantityProduced(); got != 1300 {
		t.Errorf("TotalQuantityProduced() = %d, want every setup's runs counted (1300)", got)
	}

	delete(job.Build.Setup, "s1")
	if got := job.TotalQuantityProduced(); got != 300 {
		t.Errorf("after removing a setup = %d, want 300", got)
	}
}

// Nothing is produced without setups, which is what stops a job with none from
// being archived as though it had made something.
func TestTotalQuantityProducedIsZeroWithoutSetups(t *testing.T) {
	t.Parallel()

	if got := (Job{ItemsProducedPerRun: 100}).TotalQuantityProduced(); got != 0 {
		t.Errorf("TotalQuantityProduced() = %d, want 0", got)
	}
}
