package models

import (
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

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
	job.Build.Materials = []JobMaterial{
		{TypeID: 34, Purchasing: []Purchase{{ID: "p1", ItemCount: 60, ItemCost: 1}}},
		{TypeID: 35, Purchasing: []Purchase{{ID: "p2", ItemCount: 40, ItemCost: 1}}},
	}
	job.Build.Setup = map[string]JobSetup{"s1": {ID: "s1", MaterialCount: map[string]MaterialCount{
		"34": {TypeID: 34, Quantity: 60},
		"35": {TypeID: 35, Quantity: 40},
	}}}
	job.Build.Costs.LinkedJobs = []LinkedESIJob{{JobID: 1, Cost: 3}, {JobID: 2, Cost: 2}}
	job.Build.Costs.InventionEntries = []InventionEntry{{ID: "i1", ItemName: "Datacore", ItemCost: 2}}
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

// The SPA writes both halves of the plan on every job, nulled where there is no
// override, so a plan subdocument of nulls is the shape almost every stored job
// has. It must decode to no override rather than to an override of nothing.
func TestANulledSellingPlanIsNoOverride(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{
		"plan": bson.M{"sellerCharacter": nil, "saleLocationID": nil},
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var got JobSale
	if err := bson.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if got.Plan.SellerCharacter != nil {
		t.Errorf("SellerCharacter = %v, want nil", *got.Plan.SellerCharacter)
	}
	if got.Plan.SaleLocationID != nil {
		t.Errorf("SaleLocationID = %v, want nil", *got.Plan.SaleLocationID)
	}
}

// Both halves of the override travel independently: a job may name a seller
// without naming where, and a location without naming who.
func TestEachHalfOfTheSellingPlanTravelsOnItsOwn(t *testing.T) {
	t.Parallel()

	seller := "hash-1"
	raw, err := bson.Marshal(JobSale{Plan: JobSellingPlan{SellerCharacter: &seller}})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var got JobSale
	if err := bson.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if got.Plan.SellerCharacter == nil || *got.Plan.SellerCharacter != seller {
		t.Fatalf("seller did not survive the round trip: %+v", got.Plan)
	}
	if got.Plan.SaleLocationID != nil {
		t.Errorf("SaleLocationID = %v, want nil", *got.Plan.SaleLocationID)
	}
}

// Every job stored before the estimate existed carries fee rows without it. They
// must read as no estimate rather than as a sale taxed nothing, and the figure
// must stay out of what a job cost — the transaction the sale produces carries
// what was actually charged.
func TestABrokerFeeStoredWithoutAnEstimateHasNone(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{
		"order_id": 900,
		"id":       int64(55),
		"date":     "2026-08-01T00:00:00Z",
		"amount":   1500000.0,
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var fee BrokerFee
	if err := bson.Unmarshal(raw, &fee); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}

	if fee.SalesTax != 0 {
		t.Errorf("SalesTax = %v, want 0", fee.SalesTax)
	}
	if fee.Amount != 1500000 {
		t.Errorf("Amount = %v, want 1500000", fee.Amount)
	}
}

// The estimate is a forecast, so nothing that totals what a job cost may take it.
func TestTheSalesTaxEstimateStaysOutOfACostTotal(t *testing.T) {
	t.Parallel()

	job := Job{}
	job.Build.Sale.BrokersFee = []BrokerFee{
		{OrderID: 900, Amount: 1_500_000, SalesTax: 7_500_000},
	}

	if got := job.CostParts().BrokersFee; got != 1_500_000 {
		t.Errorf("BrokersFee = %v, want 1500000 (the estimate must not be in it)", got)
	}
}

// The id was minted from the clock and stored as a number until it became a
// uuid, so the collection holds both, and a document written then still has to
// decode. The counts that were taken — 184 archived jobs and 12 live ones — are
// from dev and say nothing about how many exist in production.
func TestAnInventionEntryDecodesAnIDWrittenAsANumber(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{
		"id":       int64(1789083363901),
		"itemName": "Datacore",
		"itemCost": 125000.0,
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var entry InventionEntry
	if err := bson.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}

	if entry.ID != "1789083363901" {
		t.Errorf("ID = %q, want the number's own digits", entry.ID)
	}
	if entry.ItemName != "Datacore" || entry.ItemCost != 125000 {
		t.Errorf("the rest of the row did not survive: %+v", entry)
	}
}

func TestAnInventionEntryDecodesAUUID(t *testing.T) {
	t.Parallel()

	const id = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"
	raw, err := bson.Marshal(bson.M{"id": id, "itemName": "Decryptor"})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var entry InventionEntry
	if err := bson.Unmarshal(raw, &entry); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}

	if entry.ID != id {
		t.Errorf("ID = %q, want %q", entry.ID, id)
	}
}

// The SPA sends JSON, and an older row reaches it as a JSON number.
func TestAnInventionEntryDecodesEitherIDFromJSON(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct{ body, want string }{
		{`{"id":1789083363901,"itemName":"Datacore"}`, "1789083363901"},
		{`{"id":"3f2a1b4c-5d6e","itemName":"Datacore"}`, "3f2a1b4c-5d6e"},
	} {
		var entry InventionEntry
		if err := json.Unmarshal([]byte(tc.body), &entry); err != nil {
			t.Fatalf("json.Unmarshal(%s): %v", tc.body, err)
		}
		if entry.ID != tc.want {
			t.Errorf("ID = %q, want %q", entry.ID, tc.want)
		}
	}
}
