package commands

import (
	"testing"

	"eve-industry-planner/shared/models"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// fixedMint makes a converted document comparable: the real mint is random, and
// what the tests check is that a row with no id gets one in the right shape, not
// which value it drew.
func fixedMint(value int64) mintTransactionID {
	return func() int64 { return value }
}

func jobWithSale(orders bson.A, fees bson.A, transactions bson.A) bson.M {
	return bson.M{
		"_id": "job-1",
		"build": bson.M{
			"sale": bson.M{"marketOrders": orders, "brokersFee": fees, "transactions": transactions},
		},
	}
}

func TestReshapeJobDocument_keysRowCollectionsByTheIDTheyCarry(t *testing.T) {
	doc := bson.M{
		"skills": bson.A{bson.M{"typeID": int32(3380), "level": int32(5)}},
		"build": bson.M{
			"materials": bson.A{bson.M{
				"typeID":     int32(34),
				"purchasing": bson.A{bson.M{"id": "p1", "typeID": int32(34), "itemCount": int32(10)}},
			}},
			"costs": bson.M{
				"extrasCosts":      bson.A{bson.M{"id": "e1"}},
				"inventionEntries": bson.A{bson.M{"id": "i1"}},
				"linkedJobs":       bson.A{bson.M{"job_id": int64(643267666)}},
			},
		},
	}

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.refused() {
		t.Fatalf("refused: %v", report.Refusals)
	}

	build := asDocument(out["build"])
	esi := asDocument(out["esi"])
	for path, keyed := range map[string]bson.M{
		"skills":                 asDocument(out["skills"]),
		"build.materials":        asDocument(build["materials"]),
		"build.extrasCosts":      asDocument(build["extrasCosts"]),
		"build.inventionEntries": asDocument(build["inventionEntries"]),
		"esi.industryJobs":       asDocument(esi["industryJobs"]),
	} {
		if len(keyed) != 1 {
			t.Errorf("%s = %v, want one keyed row", path, keyed)
		}
	}
	if _, held := asDocument(out["skills"])["3380"]; !held {
		t.Errorf("skills keyed %v, want a numeric typeID rendered as its string", out["skills"])
	}
	if _, held := asDocument(esi["industryJobs"])["643267666"]; !held {
		t.Errorf("industryJobs keyed %v, want the job_id", esi["industryJobs"])
	}
	if build["costs"] != nil || build["sale"] != nil {
		t.Errorf("build still carries costs/sale: %v", build)
	}
}

func TestReshapeJobDocument_dropsAPurchasesRepeatedTypeID(t *testing.T) {
	doc := bson.M{"build": bson.M{"materials": bson.A{bson.M{
		"typeID":     int32(34),
		"purchasing": bson.A{bson.M{"id": "p1", "typeID": int32(34)}},
	}}}}

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.PurchaseTypeIDs != 1 {
		t.Errorf("PurchaseTypeIDs = %d, want 1", report.PurchaseTypeIDs)
	}
	purchase := asDocument(asDocument(asDocument(asDocument(out["build"])["materials"])["34"])["purchasing"])["p1"]
	if _, held := asDocument(purchase)["typeID"]; held {
		t.Errorf("purchase kept its typeID: %v", purchase)
	}
}

func TestReshapeJobDocument_keepsTheOldestFeeOnItsOrder(t *testing.T) {
	doc := jobWithSale(
		bson.A{bson.M{"order_id": int64(7351330862)}},
		bson.A{
			bson.M{"order_id": int64(7351330862), "id": int64(2), "date": "2026-06-08T18:23:10Z", "amount": 23390.5},
			bson.M{"order_id": int64(7351330862), "id": int64(1), "date": "2026-06-02T08:40:10Z", "amount": 23476.6},
		}, nil)

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.refused() {
		t.Fatalf("refused: %v", report.Refusals)
	}

	order := asDocument(asDocument(asDocument(out["esi"])["marketOrders"])["7351330862"])
	fee := asDocument(order["fee"])
	if got := asString(fee["date"]); got != "2026-06-02T08:40:10Z" {
		t.Errorf("kept fee dated %q, want the oldest", got)
	}
	if report.FeesDroppedLater != 1 {
		t.Errorf("FeesDroppedLater = %d, want 1", report.FeesDroppedLater)
	}
	if report.FeeISKDroppedLater != 23390.5 {
		t.Errorf("FeeISKDroppedLater = %v, want the later entry's amount", report.FeeISKDroppedLater)
	}
	if _, held := fee["order_id"]; held {
		t.Errorf("fee kept order_id, which its position now states: %v", fee)
	}
}

func TestReshapeJobDocument_dropsAFeeWhoseOrderIsGone(t *testing.T) {
	doc := jobWithSale(bson.A{},
		bson.A{bson.M{"order_id": int64(6967154095), "id": int64(9), "date": "2025-01-30T19:20:35Z", "amount": 5692500}}, nil)

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.FeesDroppedOrphan != 1 {
		t.Errorf("FeesDroppedOrphan = %d, want 1", report.FeesDroppedOrphan)
	}
	if report.FeeISKDroppedOrphan != 5692500 {
		t.Errorf("FeeISKDroppedOrphan = %v, want the orphan's amount", report.FeeISKDroppedOrphan)
	}
	if report.FeeISKDroppedLater != 0 {
		t.Errorf("FeeISKDroppedLater = %v, want an orphan counted apart from a later charge", report.FeeISKDroppedLater)
	}
}

func TestReshapeJobDocument_shedsTheFieldsNoModelReads(t *testing.T) {
	doc := jobWithSale(
		bson.A{bson.M{"order_id": int64(1)}},
		bson.A{bson.M{"order_id": int64(1), "id": int64(1), "date": "2026-01-01T00:00:00Z",
			"amount": 1.0, "complete": false, "CharacterHash": "hash"}}, nil)

	out, _ := reshapeJobDocument(doc, fixedMint(-1))
	fee := asDocument(asDocument(asDocument(asDocument(out["esi"])["marketOrders"])["1"])["fee"])
	for _, field := range []string{"complete", "CharacterHash"} {
		if _, held := fee[field]; held {
			t.Errorf("fee kept %s: %v", field, fee)
		}
	}
}

func TestReshapeJobDocument_mintsAnIDForAHandEnteredSaleBeforeKeying(t *testing.T) {
	doc := jobWithSale(nil, nil, bson.A{
		bson.M{"transaction_id": int64(0), "amount": 1.0},
		bson.M{"transaction_id": int64(0), "amount": 2.0},
	})

	out, report := reshapeJobDocument(doc, sequentialMint())
	if report.refused() {
		t.Fatalf("refused: %v", report.Refusals)
	}
	if report.TransactionsMinted != 2 {
		t.Errorf("TransactionsMinted = %d, want 2", report.TransactionsMinted)
	}
	// Both rows survive: minting after the keying would have collapsed them onto
	// one key, which is the ordering rule this asserts.
	if keyed := asDocument(asDocument(out["esi"])["transactions"]); len(keyed) != 2 {
		t.Errorf("transactions = %v, want both rows kept", keyed)
	}
}

func sequentialMint() mintTransactionID {
	next := int64(0)
	return func() int64 { next--; return next }
}

func TestReshapeJobDocument_keepsTheLongestTimeStampsWhenOrdersCollapse(t *testing.T) {
	doc := jobWithSale(bson.A{
		bson.M{"order_id": int64(7284304886), "timeStamps": bson.A{"a", "b"}},
		bson.M{"order_id": int64(7284304886), "timeStamps": bson.A{"a", "b", "c"}},
	}, nil, nil)

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.OrdersMerged != 1 {
		t.Errorf("OrdersMerged = %d, want 1", report.OrdersMerged)
	}
	order := asDocument(asDocument(asDocument(out["esi"])["marketOrders"])["7284304886"])
	if got := len(asArray(order["timeStamps"])); got != 3 {
		t.Errorf("kept %d timestamps, want the longer history", got)
	}
}

func TestReshapeJobDocument_collapsesIdenticalRowsWithoutRefusing(t *testing.T) {
	row := func() bson.M { return bson.M{"job_id": int64(643267666), "runs": int32(115), "status": "active"} }
	doc := bson.M{"build": bson.M{"costs": bson.M{"linkedJobs": bson.A{row(), row()}}}}

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.refused() {
		t.Fatalf("refused two identical rows: %v", report.Refusals)
	}
	if report.DuplicateRows != 1 {
		t.Errorf("DuplicateRows = %d, want 1", report.DuplicateRows)
	}
	if keyed := asDocument(asDocument(out["esi"])["industryJobs"]); len(keyed) != 1 {
		t.Errorf("industryJobs = %v, want the duplicate collapsed into one", keyed)
	}
}

func TestReshapeJobDocument_collapsesRowsWritingTheirFieldsInAnotherOrder(t *testing.T) {
	doc := bson.M{"build": bson.M{"costs": bson.M{"linkedJobs": bson.A{
		bson.M{"job_id": int64(1), "runs": int32(2), "status": "active"},
		bson.M{"status": "active", "job_id": int64(1), "runs": int32(2)},
	}}}}

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.refused() {
		t.Fatalf("field order was read as a difference: %v", report.Refusals)
	}
}

func TestReshapeJobDocument_refusesTwoOrdersDifferingBeyondTheirHistory(t *testing.T) {
	doc := jobWithSale(bson.A{
		bson.M{"order_id": int64(1), "volume_remain": int32(10), "timeStamps": bson.A{"a"}},
		bson.M{"order_id": int64(1), "volume_remain": int32(4), "timeStamps": bson.A{"a", "b"}},
	}, nil, nil)

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if !report.refused() {
		t.Fatal("two orders differing in volume_remain merged silently, want a refusal")
	}
}

func TestReshapeJobDocument_countsADuplicateFeeApartFromALaterCharge(t *testing.T) {
	fee := func() bson.M {
		return bson.M{"order_id": int64(1), "id": int64(7), "date": "2026-01-01T00:00:00Z", "amount": 100.0}
	}
	doc := jobWithSale(bson.A{bson.M{"order_id": int64(1)}}, bson.A{fee(), fee()}, nil)

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.FeesDroppedCopy != 1 || report.FeeISKDroppedCopy != 100 {
		t.Errorf("duplicates = %d (%v ISK), want 1 (100)", report.FeesDroppedCopy, report.FeeISKDroppedCopy)
	}
	if report.FeesDroppedLater != 0 {
		t.Errorf("FeesDroppedLater = %d, want a duplicate counted apart", report.FeesDroppedLater)
	}
}

func TestReshapeJobDocument_refusesRatherThanLosingARow(t *testing.T) {
	doc := bson.M{"build": bson.M{"costs": bson.M{"extrasCosts": bson.A{
		bson.M{"id": "e1", "extraValue": 1.0},
		bson.M{"id": "e1", "extraValue": 2.0},
	}}}}

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if !report.refused() {
		t.Fatal("two rows under one key converted silently, want a refusal")
	}
}

func TestReshapeJobDocument_refusesARowWithNoUsableKey(t *testing.T) {
	doc := bson.M{"build": bson.M{"costs": bson.M{"extrasCosts": bson.A{bson.M{"id": ""}}}}}

	_, report := reshapeJobDocument(doc, fixedMint(-1))
	if !report.refused() {
		t.Fatal("a row with an empty id converted, want a refusal")
	}
}

func TestReshapeJobDocument_leavesTheDocumentItWasGiven(t *testing.T) {
	doc := bson.M{"build": bson.M{"costs": bson.M{"extrasCosts": bson.A{bson.M{"id": "e1"}}}}}

	reshapeJobDocument(doc, fixedMint(-1))
	if asDocument(pathValue(doc, "build", "costs")) == nil {
		t.Error("the input document was modified; a dry run would have changed what it read")
	}
}

func TestMintNegativeTransactionID_isOutsideTheSpaceESIIssuesFrom(t *testing.T) {
	for range 100 {
		id := mintNegativeTransactionID()
		if id >= 0 {
			t.Fatalf("minted %d, want a negative id", id)
		}
		if id < -(1 << 48) {
			t.Fatalf("minted %d, want it inside 48 bits", id)
		}
	}
}

func TestMapKey_refusesWhatAnIDIsNeverStoredAs(t *testing.T) {
	for _, value := range []any{nil, "", 1.5, bson.M{}, bson.A{}, true} {
		if _, usable := mapKey(value); usable {
			t.Errorf("mapKey(%#v) was accepted as a key", value)
		}
	}
	for _, value := range []any{"id", int32(1), int64(1), 2.0} {
		if _, usable := mapKey(value); !usable {
			t.Errorf("mapKey(%#v) was refused", value)
		}
	}
}

func TestEmptyLayout_movesThePricingDecisionAndDropsTheRest(t *testing.T) {
	doc := bson.M{"build": bson.M{}, "layout": bson.M{
		"localMarketDisplay":     "jita",
		"localOrderDisplay":      "sell",
		"materialPriceOverrides": bson.M{"34": bson.M{"market": "amarr"}},
		"esiJobTab":              "linked",
		"setupToEdit":            "setup-1",
		"resourceDisplayType":    "grid",
	}}

	out, _ := reshapeJobDocument(doc, fixedMint(-1))
	if _, held := out["layout"]; held {
		t.Error("layout survived the conversion")
	}
	build := asDocument(out["build"])
	if asDocument(build["materialPriceOverrides"]) == nil {
		t.Error("materialPriceOverrides did not move under build")
	}
	pricing := asDocument(build["localPricing"])
	for _, side := range []string{"buying", "selling"} {
		if got := asString(asDocument(pricing[side])["market"]); got != "jita" {
			t.Errorf("%s market = %q, want the single market seeding both sides", side, got)
		}
	}
	for _, dropped := range []string{"esiJobTab", "setupToEdit", "resourceDisplayType"} {
		if _, held := build[dropped]; held {
			t.Errorf("%s was carried into build", dropped)
		}
	}
}

func TestEmptyLayout_letsAChosenSideStandOverTheSingleMarket(t *testing.T) {
	doc := bson.M{"build": bson.M{}, "layout": bson.M{
		"localMarketDisplay": "jita",
		"localPricing":       bson.M{"buying": bson.M{"market": "amarr", "basis": "buy"}},
	}}

	out, _ := reshapeJobDocument(doc, fixedMint(-1))
	pricing := asDocument(asDocument(out["build"])["localPricing"])
	if got := asString(asDocument(pricing["buying"])["market"]); got != "amarr" {
		t.Errorf("buying market = %q, want the side the player chose", got)
	}
	if got := asString(asDocument(pricing["selling"])["market"]); got != "jita" {
		t.Errorf("selling market = %q, want the single market it seeds from", got)
	}
}

func TestEmptyLayout_writesNoPricingWhereNoneWasChosen(t *testing.T) {
	doc := bson.M{"build": bson.M{}, "layout": bson.M{"esiJobTab": "linked"}}

	out, _ := reshapeJobDocument(doc, fixedMint(-1))
	if _, held := asDocument(out["build"])["localPricing"]; held {
		t.Error("localPricing was written for a job that chose nothing")
	}
}

func TestReshapeJobDocument_keepsAFeeWhenItsOrderRowLosesTheHistoryComparison(t *testing.T) {
	// The fee is recorded against an order whose first stored row observed less
	// of its history. Folding before the rows collapse attaches the fee to the
	// row that is then discarded, and the fee goes with it.
	doc := jobWithSale(bson.A{
		bson.M{"order_id": int64(1), "timeStamps": bson.A{"a"}},
		bson.M{"order_id": int64(1), "timeStamps": bson.A{"a", "b"}},
	}, bson.A{bson.M{"order_id": int64(1), "id": int64(7), "date": "2026-01-01T00:00:00Z", "amount": 100.0}}, nil)

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	if report.refused() {
		t.Fatalf("refused: %v", report.Refusals)
	}
	order := asDocument(asDocument(asDocument(out["esi"])["marketOrders"])["1"])
	if order["fee"] == nil {
		t.Fatal("the fee was lost with the order row that observed less history")
	}
	if got := len(asArray(order["timeStamps"])); got != 2 {
		t.Errorf("kept %d timestamps, want the longer history", got)
	}
	if report.FeesFolded != 1 {
		t.Errorf("FeesFolded = %d, want 1", report.FeesFolded)
	}
}

func TestEmptyLayout_writesAnEmptySideAsTheModelDefinesIt(t *testing.T) {
	doc := bson.M{"build": bson.M{}, "layout": bson.M{
		"localPricing": bson.M{"buying": bson.M{"market": "amarr", "basis": "buy"}},
	}}

	out, _ := reshapeJobDocument(doc, fixedMint(-1))
	selling := asDocument(asDocument(asDocument(out["build"])["localPricing"])["selling"])
	if len(selling) != 0 {
		t.Errorf("selling = %v, want an empty side rather than empty strings", selling)
	}
}

func TestReshapeJobDocument_dropsWhatTheReshapedShapeDoesNotHold(t *testing.T) {
	doc := bson.M{
		"jobID":            "job-1",
		"apiJobs":          bson.A{},
		"apiOrders":        bson.A{},
		"apiTransactions":  bson.A{},
		"archiveProcessed": true,
		"build": bson.M{
			"products": bson.A{bson.M{"typeID": int32(1)}},
			"setup": bson.M{"s1": bson.M{
				"id": "s1", "runCount": int32(2),
				"materialCount": bson.M{"34": bson.M{"typeID": int32(34)}},
				"estimatedTime": 1.0, "rawTime": 2.0, "estimatedInstallCost": 3.0,
			}},
		},
	}

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	for _, field := range []string{"apiJobs", "apiOrders", "apiTransactions", "archiveProcessed"} {
		if _, held := out[field]; held {
			t.Errorf("%s survived", field)
		}
	}
	build := asDocument(out["build"])
	if _, held := build["products"]; held {
		t.Error("build.products survived")
	}
	setup := asDocument(asDocument(build["setup"])["s1"])
	for _, field := range derivedSetupFields {
		if _, held := setup[field]; held {
			t.Errorf("setup kept the derived %s", field)
		}
	}
	if setup["runCount"] == nil || out["jobID"] == nil {
		t.Error("pruning took a field the reshaped shape holds")
	}
	for field, want := range map[string]int{"apiJobs": 1, "build.products": 1, "build.setup.rawTime": 1} {
		if report.FieldsDropped[field] != want {
			t.Errorf("FieldsDropped[%q] = %d, want %d", field, report.FieldsDropped[field], want)
		}
	}
}

func TestReshapeJobDocument_leavesAnAlreadyReshapedDocumentAlone(t *testing.T) {
	doc := bson.M{
		"jobID":  "job-1",
		"skills": bson.A{bson.M{"typeID": int32(3380), "level": int32(5)}},
		"build": bson.M{
			"materials": bson.A{bson.M{"typeID": int32(34)}},
			"costs":     bson.M{"extrasCosts": bson.A{bson.M{"id": "e1"}}},
			"sale":      bson.M{"marketOrders": bson.A{bson.M{"order_id": int64(1)}}},
		},
	}

	first, _ := reshapeJobDocument(doc, fixedMint(-1))
	second, report := reshapeJobDocument(first, fixedMint(-1))
	if !report.AlreadyShaped {
		t.Error("a converted document was not recognised as already reshaped")
	}
	if !sameRow(first, second) {
		t.Errorf("a second run changed the document:\nfirst  %v\nsecond %v", first, second)
	}
}

func TestReshapeJobDocument_namesTheShapeAnInventionEntryWasWrittenIn(t *testing.T) {
	doc := bson.M{"build": bson.M{"costs": bson.M{"inventionEntries": bson.A{
		bson.M{"id": "i1", "itemName": "Datacore", "itemCost": 1.0},
		bson.M{"id": "i2", "itemName": "Decryptor", "itemCost": 2.0, "version": int32(2)},
	}}}}

	out, report := reshapeJobDocument(doc, fixedMint(-1))
	entries := asDocument(asDocument(out["build"])["inventionEntries"])
	if got := asInt64(asDocument(entries["i1"])["version"]); got != models.InventionEntrySchemaCurrent {
		t.Errorf("i1 version = %d, want %d", got, models.InventionEntrySchemaCurrent)
	}
	if got := asInt64(asDocument(entries["i2"])["version"]); got != 2 {
		t.Errorf("i2 version = %d, want the version it already stated", got)
	}
	if report.InventionVersionsStamped != 1 {
		t.Errorf("InventionVersionsStamped = %d, want only the row that carried none", report.InventionVersionsStamped)
	}
}
