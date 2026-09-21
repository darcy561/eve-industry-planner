package commands

import (
	"context"
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

const marketLaneScratchAccount = "eip-parity-market-lane-account"

// What the step leaves behind is checked as stored BSON rather than through the
// decoder: a nil slice and an empty one decode alike, so the decoder would
// report success over a document the step never touched.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_seedMarketLocationLane_givesEveryDocumentAnEmptyLane(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	now := time.Now().UTC()

	accountID := marketLaneScratchAccount + "-account-settings"
	plannerOwner := models.AccountOwner(marketLaneScratchAccount + "-planner")
	plannerID := plannerOwner.Key()

	accountColl := mongo.Coll(eipmongo.CollectionAccountSettings)
	plannerColl := mongo.Coll(eipmongo.CollectionPlannerSettings)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = accountColl.DeleteOne(cctx, bson.M{"_id": accountID})
		_, _ = plannerColl.DeleteOne(cctx, bson.M{"_id": plannerID})
	})

	accountSeed, err := eipmongo.StructToMongoDoc(models.DefaultApplicationSettings(accountID, now), accountID)
	if err != nil {
		t.Fatalf("build account settings seed: %v", err)
	}
	// As a document written before the lane existed holds it: not at all.
	delete(accountSeed, "marketLocations")
	if _, err := accountColl.ReplaceOne(ctx, bson.M{"_id": accountID}, accountSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed account settings: %v", err)
	}

	plannerSeed, err := eipmongo.StructToMongoDoc(planner.DefaultSettings(plannerOwner, now), plannerID)
	if err != nil {
		t.Fatalf("build planner settings seed: %v", err)
	}
	// The other way a document can owe a lane: something wrote the field before
	// this step ran and wrote nil into it.
	plannerSeed["marketLocations"] = nil
	if _, err := plannerColl.ReplaceOne(ctx, bson.M{"_id": plannerID}, plannerSeed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed planner settings: %v", err)
	}

	report, err := seedMarketLocationLane(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	t.Logf("dry run: %s", report)
	if storedLaneIsArray(t, ctx, accountColl, accountID) {
		t.Error("the dry run wrote a lane into the account settings document")
	}

	if _, err := seedMarketLocationLane(ctx, clients, false); err != nil {
		t.Fatalf("seed market lane: %v", err)
	}

	for _, seeded := range []struct {
		label string
		coll  *mongodriver.Collection
		id    string
	}{
		{"account settings", accountColl, accountID},
		{"planner settings", plannerColl, plannerID},
	} {
		if !storedLaneIsArray(t, ctx, seeded.coll, seeded.id) {
			t.Errorf("%s still owes a market lane", seeded.label)
		}
	}

	// A release step runs again on the next release, and on a retry within this
	// one. The second pass must find nothing left to do.
	second, err := seedMarketLocationLane(ctx, clients, false)
	if err != nil {
		t.Fatalf("second pass: %v", err)
	}
	t.Logf("second pass: %s", second)
}

// storedLaneIsArray reports what the document holds rather than what the model
// decodes: an absent lane and an empty one are the same value in Go.
func storedLaneIsArray(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string) bool {
	t.Helper()

	var stored bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&stored); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	held, found := stored["marketLocations"]
	if !found || held == nil {
		return false
	}
	_, isArray := held.(bson.A)
	return isArray
}
