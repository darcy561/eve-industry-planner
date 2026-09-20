package commands

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const structureRigScratchAccount = "eip-parity-structure-rig-account"

// What the step leaves behind is read as stored BSON rather than through the
// model, because the model no longer names rigType at all — decoding would
// report slots of zero for a document the step never touched and a document it
// converted alike.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_foldStructureRigSlots_rewritesTheStoredRigs(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	now := time.Now().UTC()

	convertedID := structureRigScratchAccount + "-array"
	lanesID := structureRigScratchAccount + "-lanes"
	coll := mongo.Coll(eipmongo.CollectionAccountSettings)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": convertedID})
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": lanesID})
	})

	seed := func(id string, structures any) {
		t.Helper()
		doc, err := eipmongo.StructToMongoDoc(models.DefaultApplicationSettings(id, now), id)
		if err != nil {
			t.Fatalf("build settings seed: %v", err)
		}
		doc["customStructures"] = structures
		if _, err := coll.ReplaceOne(ctx, bson.M{"_id": id}, doc, options.Replace().SetUpsert(true)); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}

	// A folded document, holding one structure per case the step has to handle.
	seed(convertedID, []bson.M{
		{"id": "man-combined", "jobType": 1, "name": "Sotiyo", "rigType": 5},
		{"id": "man-single", "jobType": 1, "name": "Azbel", "rigType": 9},
		{"id": "reac-none", "jobType": 2, "name": "Tatara"},
		{"id": "repro-slots", "jobType": 5, "name": "Athanor", "rigSlot1": 7, "implant": 4},
	})
	// A document the lane fold could not move. Its rigs must be left alone: the
	// step writes an array, and writing one here would destroy the lists.
	seed(lanesID, bson.M{
		"manufacturing": []bson.M{{"id": "man-lane", "name": "Raitaru", "rigType": 5}},
	})

	// A dry run must report the work without doing it.
	report, err := foldStructureRigSlots(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if storedStructureRows(t, ctx, coll, convertedID)[0]["rigSlot1"] != nil {
		t.Fatalf("a dry run converted a structure: %s", report)
	}

	if _, err := foldStructureRigSlots(ctx, clients, false); err != nil {
		t.Fatalf("fold: %v", err)
	}

	rows := storedStructureRows(t, ctx, coll, convertedID)
	for _, want := range []struct {
		at           int
		slot1, slot2 any
	}{
		{0, int32(1), int32(3)}, // 5 decomposes
		{1, int32(9), int32(0)}, // 9 stays one rig
	} {
		got := rows[want.at]
		if got["rigSlot1"] != want.slot1 || got["rigSlot2"] != want.slot2 {
			t.Errorf("%v slots = %v/%v, want %v/%v",
				got["id"], got["rigSlot1"], got["rigSlot2"], want.slot1, want.slot2)
		}
		if _, held := got["rigType"]; held {
			t.Errorf("%v kept its stored rigType", got["id"])
		}
	}
	// A structure that never named a rig is not given slots it did not have.
	if _, held := rows[2]["rigSlot1"]; held {
		t.Error("a structure with no rigType was given slots")
	}
	// A kind that already held slots keeps them.
	if rows[3]["rigSlot1"] != int32(7) || rows[3]["implant"] != int32(4) {
		t.Errorf("a reprocessing structure was disturbed: %v", rows[3])
	}

	// A document the lane fold could not move must come through untouched. Three
	// things independently ensure that — the query filter, the type assertion on
	// the structures field, and bson decoding a keyed-list document as bson.M
	// rather than bson.A — so this asserts the outcome rather than any one of
	// them, and holds whichever of the three a later change leaves standing.
	var lanes bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": lanesID}).Decode(&lanes); err != nil {
		t.Fatalf("read the keyed-list document: %v", err)
	}
	held, isLanes := lanes["customStructures"].(bson.M)
	if !isLanes {
		t.Fatalf("the keyed lists were written over as %T", lanes["customStructures"])
	}
	lane, _ := held["manufacturing"].(bson.A)
	if len(lane) != 1 {
		t.Fatalf("the manufacturing lane holds %d rows, want 1", len(lane))
	}
	if row, _ := lane[0].(bson.M); row["rigType"] != int32(5) {
		t.Errorf("a lane row's rigType = %v, want it untouched", row["rigType"])
	}

	// Running again must find nothing: the step is re-run by every later release.
	second, err := foldStructureRigSlots(ctx, clients, false)
	if err != nil {
		t.Fatalf("second fold: %v", err)
	}
	after := storedStructureRows(t, ctx, coll, convertedID)
	if after[0]["rigSlot1"] != int32(1) || after[0]["rigSlot2"] != int32(3) {
		t.Errorf("a second run moved the slots: %v (%s)", after[0], second)
	}
}

// Read as raw BSON, not through models.CustomStructures as the fold's own live
// test does: the model does not name rigType, so decoding cannot tell a
// converted row from one the step never reached.
func storedStructureRows(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string) []bson.M {
	t.Helper()
	var doc bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&doc); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	rows, held := doc["customStructures"].(bson.A)
	if !held {
		t.Fatalf("%s holds its structures as %T, want an array", id, doc["customStructures"])
	}
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		out = append(out, asDocument(row))
	}
	return out
}
