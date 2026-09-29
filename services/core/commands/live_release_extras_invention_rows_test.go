package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

const (
	rowsScratchCollection         = "eip_parity_release_extras_invention_rows"
	rowsRefusingScratchCollection = "eip_parity_release_extras_invention_rows_refusing"
)

func scratchRowsCollection(ctx context.Context, t *testing.T, coll *mongodriver.Collection, docs ...any) {
	t.Helper()
	_ = coll.Drop(ctx)
	t.Cleanup(func() { _ = coll.Drop(context.Background()) })
	if _, err := coll.InsertMany(ctx, docs); err != nil {
		t.Fatalf("seed %s: %v", coll.Name(), err)
	}
}

func numericInventionJob(id string) bson.M {
	return bson.M{"_id": id, "build": bson.M{
		"extrasCosts": bson.M{"e-1": bson.M{"id": "e-1", "extraText": "Courier", "extraValue": 120000.0}},
		"inventionEntries": bson.M{"1712345678901": bson.M{
			"version": int32(1), "id": int64(1712345678901), "itemName": "Datacore", "itemCost": 1500.0,
		}},
	}}
}

func TestLive_normaliseExtrasAndInventionRows_storesANumericIDAsAStringOnce(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	coll := mongo.Coll(rowsScratchCollection)
	scratchRowsCollection(ctx, t, coll,
		numericInventionJob("job-numeric"),
		bson.M{"_id": "job-clean", "build": bson.M{
			"inventionEntries": bson.M{"i-1": bson.M{"version": int32(1), "id": "i-1", "itemName": "Datacore", "itemCost": 1.0}},
		}},
	)

	report, err := normaliseExtrasAndInventionRowsAcross(ctx, mongo, []string{rowsScratchCollection}, false)
	if err != nil {
		t.Fatalf("normalise: %v", err)
	}
	if !strings.Contains(report, "1 row(s) across 1 document(s) normalised") {
		t.Errorf("report = %q, want one row in one document", report)
	}

	stringIDs, err := coll.CountDocuments(ctx, bson.M{"build.inventionEntries.1712345678901.id": bson.M{"$type": "string"}})
	if err != nil || stringIDs != 1 {
		t.Fatalf("documents holding the id as a string = %d (%v), want 1", stringIDs, err)
	}
	var stored bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": "job-numeric"}).Decode(&stored); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if _, held := asDocument(asDocument(asDocument(stored["build"])["extrasCosts"])["e-1"])["category"]; held {
		t.Error("the well-typed extras row beside it was rewritten")
	}

	again, err := normaliseExtrasAndInventionRowsAcross(ctx, mongo, []string{rowsScratchCollection}, false)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if !strings.Contains(again, "no row is wrongly typed") {
		t.Errorf("second run = %q, want nothing left to do", again)
	}
}

func TestLive_normaliseExtrasAndInventionRows_aRefusalInOneCollectionLeavesTheNextNormalised(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	scratchRowsCollection(ctx, t, mongo.Coll(rowsRefusingScratchCollection),
		bson.M{"_id": "job-refused", "build": bson.M{"inventionEntries": bson.M{
			"i-1": bson.M{"version": int32(1), "id": int64(99), "itemName": "Datacore", "itemCost": 1.0},
		}}},
	)
	later := mongo.Coll(rowsScratchCollection)
	scratchRowsCollection(ctx, t, later, numericInventionJob("job-numeric"))

	_, err := normaliseExtrasAndInventionRowsAcross(ctx, mongo,
		[]string{rowsRefusingScratchCollection, rowsScratchCollection}, false)

	if err == nil || !strings.Contains(err.Error(), "job-refused") {
		t.Fatalf("err = %v, want the refused row named", err)
	}
	if !strings.Contains(err.Error(), rowsScratchCollection+": 1 row(s) across 1 document(s) normalised") {
		t.Errorf("err = %v, want the later collection's report beside the refusal", err)
	}
	stringIDs, countErr := later.CountDocuments(ctx, bson.M{"build.inventionEntries.1712345678901.id": bson.M{"$type": "string"}})
	if countErr != nil || stringIDs != 1 {
		t.Errorf("later collection's string ids = %d (%v), want its row normalised despite the refusal", stringIDs, countErr)
	}
}
