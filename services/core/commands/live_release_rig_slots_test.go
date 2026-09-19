package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// The step rewrites setups nested inside stored documents, so what it leaves
// behind is read back as stored BSON: a decode would apply whatever the models
// currently say and could report success over a document never converted.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_foldRigSlots_rewritesStoredSetups(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}

	jobID := "eip-parity-rig-job"
	templateID := "eip-parity-rig-template"
	jobColl := mongo.Coll(eipmongo.CollectionJobDocuments)
	templateColl := mongo.Coll(eipmongo.CollectionGroupTemplatePayloads)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = jobColl.DeleteOne(cctx, bson.M{"_id": jobID})
		_, _ = templateColl.DeleteOne(cctx, bson.M{"_id": templateID})
	})

	job := bson.M{
		"_id": jobID,
		"build": bson.M{
			"setup": bson.M{
				// A combination, a rig that was already atomic, and the faction rig.
				"setup-a": bson.M{"rigID": 5, "runCount": 10},
				"setup-b": bson.M{"rigID": 2},
				"setup-c": bson.M{"rigID": 9},
			},
		},
	}
	if _, err := jobColl.ReplaceOne(ctx, bson.M{"_id": jobID}, job, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed job document: %v", err)
	}

	template := bson.M{
		"_id":  templateID,
		"jobs": bson.A{bson.M{"presetSetups": bson.A{bson.M{"rigID": 7}}}},
	}
	if _, err := templateColl.ReplaceOne(ctx, bson.M{"_id": templateID}, template, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed template payload: %v", err)
	}

	// A dry run reports the work without doing it.
	report, err := foldRigSlots(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	t.Logf("dry run: %s", report)
	if storedSetup(t, ctx, jobColl, jobID, "setup-a")["rigSlot1"] != nil {
		t.Error("the dry run converted a setup")
	}

	if _, err := foldRigSlots(ctx, clients, false); err != nil {
		t.Fatalf("fold rig slots: %v", err)
	}

	for name, want := range map[string]struct{ Slot1, Slot2 int32 }{
		"setup-a": {1, 3},
		"setup-b": {2, 0},
		"setup-c": {9, 0},
	} {
		got := storedSetup(t, ctx, jobColl, jobID, name)
		if got["rigSlot1"] != want.Slot1 || got["rigSlot2"] != want.Slot2 {
			t.Errorf("%s slots = %v/%v, want %d/%d",
				name, got["rigSlot1"], got["rigSlot2"], want.Slot1, want.Slot2)
		}
		if _, held := got["rigID"]; held {
			t.Errorf("%s kept its stored rigID", name)
		}
	}

	// The rest of a setup is left as it was.
	if got := storedSetup(t, ctx, jobColl, jobID, "setup-a"); got["runCount"] != int32(10) {
		t.Errorf("setup-a runCount = %v, want it untouched", got["runCount"])
	}

	var storedTemplate bson.M
	if err := templateColl.FindOne(ctx, bson.M{"_id": templateID}).Decode(&storedTemplate); err != nil {
		t.Fatalf("read template payload: %v", err)
	}
	preset := storedTemplate["jobs"].(bson.A)[0].(bson.M)["presetSetups"].(bson.A)[0].(bson.M)
	if preset["rigSlot1"] != int32(1) || preset["rigSlot2"] != int32(4) {
		t.Errorf("template preset slots = %v/%v, want 1/4", preset["rigSlot1"], preset["rigSlot2"])
	}

	// Re-running finds nothing: a converted setup is not converted again.
	second, err := foldRigSlots(ctx, clients, false)
	if err != nil {
		t.Fatalf("second fold: %v", err)
	}
	if strings.Contains(second, "setup(s)") {
		t.Errorf("second run reported %q, want nothing owing", second)
	}
}

// storedSetup reads one setup back as it sits on disk.
func storedSetup(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id, name string) bson.M {
	t.Helper()
	var doc bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&doc); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	setup, _ := asDocument(asDocument(doc["build"])["setup"])[name].(bson.M)
	if setup == nil {
		t.Fatalf("%s holds no setup %q", id, name)
	}
	return setup
}
