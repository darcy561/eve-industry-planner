package commands

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const structureScratchAccount = "eip-parity-structure-account"

// The step rewrites what is on disk, so what it leaves behind is checked as
// stored BSON rather than through the decoder — the decoder folds either shape
// and would report success over a document the step never converted.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_foldCustomStructures_rewritesTheStoredLanes(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	now := time.Now().UTC()

	accountID := structureScratchAccount + "-account-settings"
	plannerID := models.AccountOwner(structureScratchAccount + "-planner").Key()

	accountColl := mongo.Coll(eipmongo.CollectionAccountSettings)
	plannerColl := mongo.Coll(eipmongo.CollectionPlannerSettings)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = accountColl.DeleteOne(cctx, bson.M{"_id": accountID})
		_, _ = plannerColl.DeleteOne(cctx, bson.M{"_id": plannerID})
	})

	lanes := bson.M{
		"manufacturing": []bson.M{{"id": "manStruct-live", "name": "Sotiyo", "rigType": 3, "tax": 1.5, "default": true}},
		"reaction":      []bson.M{{"id": "reacStruct-live", "name": "Tatara"}},
		"reprocessing":  []bson.M{{"id": "reprocessingStruct-live", "name": "Athanor", "rigSlot1": 7, "implant": 4}},
		"invention":     []bson.M{{"id": "inventionStruct-live", "name": "Raitaru", "rigSlot1": 9}},
	}

	accountSeed, err := eipmongo.StructToMongoDoc(models.DefaultApplicationSettings(accountID, now), accountID)
	if err != nil {
		t.Fatalf("build account settings seed: %v", err)
	}
	accountSeed["customStructures"] = lanes
	if _, err := accountColl.ReplaceOne(ctx, bson.M{"_id": accountID}, accountSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}

	plannerSeed, err := eipmongo.StructToMongoDoc(planner.DefaultSettings(models.AccountOwner(structureScratchAccount+"-planner"), now), plannerID)
	if err != nil {
		t.Fatalf("build planner settings seed: %v", err)
	}
	plannerSeed["customStructures"] = lanes
	if _, err := plannerColl.ReplaceOne(ctx, bson.M{"_id": plannerID}, plannerSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed planner settings: %v", err)
	}

	// A dry run must report the work without doing it.
	report, err := foldCustomStructures(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	t.Logf("dry run: %s", report)
	if storedIsArray(t, ctx, accountColl, accountID) {
		t.Error("the dry run converted the account settings document")
	}

	if _, err := foldCustomStructures(ctx, clients, false); err != nil {
		t.Fatalf("fold custom structures: %v", err)
	}

	// Both documents now store one array, and every row carries the kind the list
	// it came out of gave it.
	for _, seeded := range []struct {
		label string
		coll  *mongodriver.Collection
		id    string
	}{
		{"account settings", accountColl, accountID},
		{"planner settings", plannerColl, plannerID},
	} {
		if !storedIsArray(t, ctx, seeded.coll, seeded.id) {
			t.Errorf("%s still stores the keyed lists", seeded.label)
			continue
		}
		rows := storedStructures(t, ctx, seeded.coll, seeded.id)
		if len(rows) != 4 {
			t.Errorf("%s stores %d rows, want the 4 seeded", seeded.label, len(rows))
			continue
		}
		byID := map[string]models.CustomStructure{}
		for _, row := range rows {
			byID[row.ID] = row
		}
		for id, wantJobType := range map[string]int{
			"manStruct-live":          models.JobTypeManufacturing,
			"reacStruct-live":         models.JobTypeReaction,
			"reprocessingStruct-live": models.JobTypeReprocessing,
			"inventionStruct-live":    models.JobTypeInvention,
		} {
			row, found := byID[id]
			if !found {
				t.Errorf("%s lost row %q", seeded.label, id)
				continue
			}
			if row.JobType != wantJobType {
				t.Errorf("%s row %q stored jobType %d, want %d", seeded.label, id, row.JobType, wantJobType)
			}
		}
		if row := byID["reprocessingStruct-live"]; row.RigSlot1 != 7 || row.Implant != 4 {
			t.Errorf("%s reprocessing row lost fields: %+v", seeded.label, row)
		}
	}

	// Re-running finds nothing: a converted document is not selected again.
	second, err := foldCustomStructures(ctx, clients, false)
	if err != nil {
		t.Fatalf("second fold: %v", err)
	}
	if !strings.Contains(second, "none owes a fold") {
		t.Errorf("second run reported %q, want nothing owing", second)
	}
}

// storedIsArray reports what the document holds on disk, which is what the step
// changes; the decoder accepts either shape and cannot tell them apart.
func storedIsArray(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string) bool {
	t.Helper()
	var raw bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&raw); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	_, isArray := raw["customStructures"].(bson.A)
	return isArray
}

func storedStructures(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string) models.CustomStructures {
	t.Helper()
	var doc struct {
		CustomStructures models.CustomStructures `bson:"customStructures"`
	}
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&doc); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	return doc.CustomStructures
}
