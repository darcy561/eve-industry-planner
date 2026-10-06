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
	job.Build.Materials = map[string]JobMaterial{
		"34": {TypeID: 34, Purchasing: map[string]Purchase{"p1": {ID: "p1", ItemCount: 60, ItemCost: 1}}},
		"35": {TypeID: 35, Purchasing: map[string]Purchase{"p2": {ID: "p2", ItemCount: 40, ItemCost: 1}}},
	}
	job.Build.Setup = map[string]JobSetup{"s1": {ID: "s1", MaterialCount: map[string]MaterialCount{
		"34": {TypeID: 34, Quantity: 60},
		"35": {TypeID: 35, Quantity: 40},
	}}}
	job.ESI.LinkedJobs = map[string]LinkedESIJob{
		"1": {JobID: 1, Cost: 3},
		"2": {JobID: 2, Cost: 2},
	}
	job.Build.InventionEntries = map[string]InventionEntry{
		"i1": {ID: "i1", ItemName: "Datacore", ItemCost: 2},
	}
	job.Build.ExtrasCosts = map[string]ExtraCost{
		"e1": {ID: "e1", ExtraValue: 2},
		"e2": {ID: "e2", ExtraValue: 1},
	}
	job.ESI.MarketOrders = map[string]MarketOrder{
		"1": {OrderID: 1, Fee: 1},
		"2": {OrderID: 2, Fee: 0.5},
	}
	job.ESI.Transactions = map[string]Transaction{
		"1": {TransactionID: 1, Tax: 0.5},
		"2": {TransactionID: 2, Tax: 0.25},
	}

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

	raw, err := bson.Marshal(bson.M{"sellerCharacter": nil, "saleLocationID": nil})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var got JobBuild
	if err := bson.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if got.SellerCharacter != nil {
		t.Errorf("SellerCharacter = %v, want nil", *got.SellerCharacter)
	}
	if got.SaleLocationID != nil {
		t.Errorf("SaleLocationID = %v, want nil", *got.SaleLocationID)
	}
}

// Both halves of the override travel independently: a job may name a seller
// without naming where, and a location without naming who.
func TestEachHalfOfTheSellingPlanTravelsOnItsOwn(t *testing.T) {
	t.Parallel()

	seller := "hash-1"
	raw, err := bson.Marshal(JobBuild{SellerCharacter: &seller})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var got JobBuild
	if err := bson.Unmarshal(raw, &got); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	if got.SellerCharacter == nil || *got.SellerCharacter != seller {
		t.Fatalf("seller did not survive the round trip: %+v", got)
	}
	if got.SaleLocationID != nil {
		t.Errorf("SaleLocationID = %v, want nil", *got.SaleLocationID)
	}
}

// An order stored with a fee but no estimate must read as no estimate rather
// than as a sale taxed nothing, and the figure must stay out of what the job
// cost — the transaction the sale produces carries what was actually charged.
func TestAnOrderStoredWithoutASalesTaxEstimateHasNone(t *testing.T) {
	t.Parallel()

	raw, err := bson.Marshal(bson.M{
		"order_id": 900,
		"feeDate":  "2026-08-01T00:00:00Z",
		"fee":      1500000.0,
	})
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}

	var order MarketOrder
	if err := bson.Unmarshal(raw, &order); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}

	if order.SalesTax != 0 {
		t.Errorf("SalesTax = %v, want 0", order.SalesTax)
	}
	if order.Fee != 1500000 {
		t.Errorf("Fee = %v, want 1500000", order.Fee)
	}
}

// The estimate is a forecast, so nothing that totals what a job cost may take it.
func TestTheSalesTaxEstimateStaysOutOfACostTotal(t *testing.T) {
	t.Parallel()

	job := Job{}
	job.ESI.MarketOrders = map[string]MarketOrder{
		"900": {OrderID: 900, Fee: 1_500_000, SalesTax: 7_500_000},
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

// The rig slots a release converts a setup to have to survive a save, which is
// the one thing the conversion itself cannot prove. Every save builds its $set
// from this struct, so a slot the struct does not name is written back as the
// old single rig and the conversion is silently undone the first time anybody
// opens the job.
func TestJobSetupRigSlotsSurviveBSON(t *testing.T) {
	t.Parallel()

	job := Job{}
	job.Build.Setup = map[string]JobSetup{"s1": {ID: "s1", RigSlot1: 2, RigSlot2: 3}}

	encoded, err := bson.Marshal(job)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Decoded as raw keys rather than back into Job, so the assertion is about
	// what Mongo holds and not about what the struct chooses to read.
	var stored struct {
		Build struct {
			Setup map[string]bson.M `bson:"setup"`
		} `bson:"build"`
	}
	if err := bson.Unmarshal(encoded, &stored); err != nil {
		t.Fatalf("unmarshal to document: %v", err)
	}
	setup := stored.Build.Setup["s1"]
	if setup["rigSlot1"] != int32(2) || setup["rigSlot2"] != int32(3) {
		t.Errorf("stored slots = %v/%v, want 2/3", setup["rigSlot1"], setup["rigSlot2"])
	}
	// The field the fold removes must not come back, or a converted setup is
	// re-converted on every release.
	if _, held := setup["rigID"]; held {
		t.Error("a saved setup wrote rigID back")
	}

	var back Job
	if err := bson.Unmarshal(encoded, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := back.Build.Setup["s1"]; got.RigSlot1 != 2 || got.RigSlot2 != 3 {
		t.Errorf("read back slots = %d/%d, want 2/3", got.RigSlot1, got.RigSlot2)
	}
}

// A keyed collection has to survive the write path, not only the conversion.
//
// Every save builds its `$set` from this struct, so a collection the reshape
// keys and the model does not is written back as whatever the model says on the
// first save after the conversion — which undoes it silently, with the document
// looking converted right up until somebody edits the job. The conversion
// passing proves the documents moved; this proves they stay moved.
func TestKeyedCollectionsSurviveTheWritePath(t *testing.T) {
	t.Parallel()

	job := Job{JobID: "job-1",
		Skills: map[string]Skill{"22242": {TypeID: 22242, Level: 4}}}
	job.Build.Materials = map[string]JobMaterial{
		"34": {TypeID: 34, Purchasing: map[string]Purchase{
			"p1": {ID: "p1", ItemCount: 60, ItemCost: 5},
		}},
	}
	job.Build.ExtrasCosts = map[string]ExtraCost{
		"e1": {ID: "e1", ExtraValue: 3},
	}
	job.Build.InventionEntries = map[string]InventionEntry{
		"i1": {ID: "i1", ItemName: "Datacore", ItemCost: 2},
	}
	job.ESI.LinkedJobs = map[string]LinkedESIJob{"1": {JobID: 1, Cost: 7}}
	job.ESI.MarketOrders = map[string]MarketOrder{"900": {OrderID: 900, Fee: 5}}
	job.ESI.Transactions = map[string]Transaction{"77": {TransactionID: 77, Tax: 1}}

	raw, err := bson.Marshal(job)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Read back as a raw document rather than as a Job: decoding into the same
	// struct would agree with itself whatever was written, where what is at stake
	// is the shape Mongo actually holds. The driver hands nested documents back as
	// bson.D, and an array as bson.A — which is the difference being asserted.
	var stored bson.D
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	build := nested(t, stored, "build")
	materials := nested(t, build, "materials")
	material := nested(t, materials, "34")
	esi := nested(t, stored, "esi")

	for _, field := range []struct {
		where string
		doc   bson.D
		key   string
	}{
		{"", stored, "skills"},
		{"build.", build, "materials"},
		{"build.materials.34.", material, "purchasing"},
		{"build.", build, "extrasCosts"},
		{"build.", build, "inventionEntries"},
		{"esi.", esi, "industryJobs"},
		{"esi.", esi, "marketOrders"},
		{"esi.", esi, "transactions"},
	} {
		held, found := lookup(field.doc, field.key)
		if !found {
			t.Errorf("%s%s was not written at all", field.where, field.key)
			continue
		}
		if _, keyed := held.(bson.D); !keyed {
			t.Errorf("%s%s is stored as %T, not a keyed document", field.where, field.key, held)
		}
	}

	// The keys are the ids, not positions: a collection keyed by anything else
	// would still be a document and pass the check above.
	if _, found := lookup(materials, "34"); !found {
		t.Errorf("a material is not filed under its own typeID: %v", materials)
	}
	if _, found := lookup(nested(t, material, "purchasing"), "p1"); !found {
		t.Errorf("a purchase is not filed under its own id: %v", material)
	}
	// Each ESI collection is filed under the id ESI itself assigned, which is how
	// a linked row is found rather than searched for.
	for _, filed := range []struct{ collection, key string }{
		{"industryJobs", "1"},
		{"marketOrders", "900"},
		{"transactions", "77"},
	} {
		if _, found := lookup(nested(t, esi, filed.collection), filed.key); !found {
			t.Errorf("esi.%s is not filed under %q: %v", filed.collection, filed.key, esi)
		}
	}
}

func lookup(doc bson.D, key string) (any, bool) {
	for _, e := range doc {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

func nested(t *testing.T, doc bson.D, key string) bson.D {
	t.Helper()
	held, found := lookup(doc, key)
	if !found {
		t.Fatalf("%s is absent", key)
	}
	inner, ok := held.(bson.D)
	if !ok {
		t.Fatalf("%s is %T, not a document", key, held)
	}
	return inner
}
