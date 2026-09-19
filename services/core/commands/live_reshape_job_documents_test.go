package commands

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const reshapeScratchAccount = "eip-parity-reshape-account"

// The conversion is unit-tested against documents built in memory; this asserts
// the write path — that a converted document survives Mongo and reads back in
// the shape the conversion produced, rather than one the driver reshaped on the
// way through. Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_reshapeJobDocuments_writesTheConvertedShape(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	mongolive.ScratchAccount(t, mongo, reshapeScratchAccount)

	owner := models.AccountOwner(reshapeScratchAccount)
	coll := mongo.Coll(eipmongo.CollectionJobDocuments)
	id := eipmongo.OwnerScopedDocumentID(owner, "reshape-live")
	seed := bson.M{
		"_id":   id,
		"_meta": bson.M{models.MetaFieldOwner: mongolive.OwnerDoc(owner)},
		"skills": bson.A{
			bson.M{"typeID": int32(3380), "level": int32(5)},
		},
		"layout": bson.M{"localMarketDisplay": "jita", "esiJobTab": "linked"},
		"build": bson.M{
			"materials": bson.A{bson.M{
				"typeID":     int32(34),
				"purchasing": bson.A{bson.M{"id": "p1", "typeID": int32(34), "itemCount": int32(10)}},
			}},
			"costs": bson.M{"linkedJobs": bson.A{bson.M{"job_id": int64(643267666)}}},
			"sale": bson.M{
				"marketOrders": bson.A{bson.M{"order_id": int64(7351330862), "timeStamps": bson.A{"a"}}},
				"brokersFee": bson.A{
					bson.M{"order_id": int64(7351330862), "id": int64(2), "date": "2026-06-08T18:23:10Z", "amount": 2.0},
					bson.M{"order_id": int64(7351330862), "id": int64(1), "date": "2026-06-02T08:40:10Z", "amount": 1.0},
				},
				"transactions": bson.A{bson.M{"transaction_id": int64(0), "amount": 5.0}},
			},
		},
	}
	if _, err := coll.InsertOne(ctx, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() { coll.DeleteOne(context.Background(), bson.M{"_id": id}) })

	opts := reshapeJobDocumentsOptions{collections: []string{eipmongo.CollectionJobDocuments}, write: true}
	if _, err := reshapeCollection(ctx, coll, opts); err != nil {
		t.Fatalf("reshapeCollection: %v", err)
	}

	var stored bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&stored); err != nil {
		t.Fatalf("read back: %v", err)
	}

	if _, held := stored["layout"]; held {
		t.Error("layout survived the write")
	}
	build := asDocument(stored["build"])
	if build["costs"] != nil || build["sale"] != nil {
		t.Errorf("build still carries costs/sale: %v", build)
	}
	if got := asString(asDocument(asDocument(build["localPricing"])["buying"])["market"]); got != "jita" {
		t.Errorf("localPricing buying market = %q, want the single market it seeds from", got)
	}

	esi := asDocument(stored["esi"])
	order := asDocument(asDocument(esi["marketOrders"])["7351330862"])
	if got := asFloat64(asDocument(order["fee"])["amount"]); got != 1 {
		t.Errorf("fee amount = %v, want the oldest entry's", got)
	}
	for _, transaction := range asDocument(esi["transactions"]) {
		if id := asInt64(asDocument(transaction)["transaction_id"]); id >= 0 {
			t.Errorf("transaction_id = %d, want a minted negative id", id)
		}
	}
	purchase := asDocument(asDocument(asDocument(asDocument(build["materials"])["34"])["purchasing"])["p1"])
	if _, held := purchase["typeID"]; held {
		t.Errorf("purchase kept the typeID its material's key states: %v", purchase)
	}

	// A second run finds nothing to convert: the arrays it reads are already maps,
	// so it is safe to re-run, which is what makes a partly finished run
	// recoverable.
	if _, err := reshapeCollection(ctx, coll, opts); err != nil {
		t.Fatalf("second run: %v", err)
	}
	var again bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&again); err != nil {
		t.Fatalf("read back after the second run: %v", err)
	}
	if !sameRow(bson.M(stored), bson.M(again)) {
		t.Error("a second run changed the document, so the conversion is not repeatable")
	}
}
