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

const marketMoveScratchAccount = "eip-parity-market-move-account"

// What the step leaves behind is read as stored BSON rather than through the
// decoder, because the decoder runs the upgrader and would report the move on a
// document the step never wrote.
//
// Requires EIP_MONGO_PARITY_LIVE=1.
func TestLive_moveMarketsToTheirOwnLane_writesTheMoveDown(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	clients := &stackservices.Clients{Mongo: mongo}
	now := time.Now().UTC()

	accountID := marketMoveScratchAccount + "-account-settings"
	plannerOwner := models.AccountOwner(marketMoveScratchAccount + "-planner")
	plannerID := plannerOwner.Key()

	accountColl := mongo.Coll(eipmongo.CollectionAccountSettings)
	plannerColl := mongo.Coll(eipmongo.CollectionPlannerSettings)

	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = accountColl.DeleteOne(cctx, bson.M{"_id": accountID})
		_, _ = plannerColl.DeleteOne(cctx, bson.M{"_id": plannerID})
	})

	accountSettings := models.DefaultApplicationSettings(accountID, now)
	accountSettings.CustomStructures = models.CustomStructures{
		{ID: "sotiyo", Name: "Sotiyo", JobType: 1, RegionID: 10000002, RigType: 3},
		{
			ID:          "azbel-market",
			Name:        "Perimeter Azbel",
			JobType:     models.StructureKindMarket,
			RegionID:    10000002,
			StructureID: 1035466617946,
			BrokerFee:   2.5,
		},
		// Left among the structures on purpose: a market naming nowhere cannot be
		// priced, and it is the row that would have the step report work on every
		// run for ever if the selector read the kind and the place off different
		// elements.
		{ID: "half-filled-in", Name: "Half filled in", JobType: models.StructureKindMarket, RegionID: 10000002},
	}
	seedSettingsDoc(t, ctx, accountColl, accountID, accountSettings)

	plannerSettings := planner.DefaultSettings(plannerOwner, now)
	plannerSettings.CustomStructures = models.CustomStructures{{
		ID:        "jita-market",
		Name:      "Jita IV-4",
		JobType:   models.StructureKindMarket,
		RegionID:  10000002,
		StationID: 60003760,
	}}
	seedSettingsDoc(t, ctx, plannerColl, plannerID, plannerSettings)

	report, err := moveMarketsToTheirOwnLane(ctx, clients, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	t.Logf("dry run: %s", report)
	if len(storedLane(t, ctx, accountColl, accountID, "marketLocations")) != 0 {
		t.Error("the dry run moved the account's markets")
	}

	if _, err := moveMarketsToTheirOwnLane(ctx, clients, false); err != nil {
		t.Fatalf("move markets: %v", err)
	}

	assertMarketMoved(t, ctx, accountColl, accountID, "azbel-market")
	assertMarketMoved(t, ctx, plannerColl, plannerID, "jita-market")

	left := storedLane(t, ctx, accountColl, accountID, "customStructures")
	if len(left) != 2 {
		t.Errorf("%d structures left, want the build kind and the market naming nowhere", len(left))
	}

	// The step runs again on the next release and on a retry within this one. A
	// second pass that still finds work has not converged, which is what a
	// selector matching the row nothing moves would look like.
	second, err := moveMarketsToTheirOwnLane(ctx, clients, false)
	if err != nil {
		t.Fatalf("second pass: %v", err)
	}
	if strings.Count(second, "none owes a market move") != len(settingsDocumentCollections) {
		t.Errorf("second pass: %s, want every collection to owe nothing", second)
	}
}

func seedSettingsDoc(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id string, settings any) {
	t.Helper()

	seed, err := eipmongo.StructToMongoDoc(settings, id)
	if err != nil {
		t.Fatalf("build seed for %s: %v", id, err)
	}
	if _, err := coll.ReplaceOne(ctx, bson.M{"_id": id}, seed, options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed %s: %v", id, err)
	}
}

// storedLane reads one lane as the document holds it, so an absent lane and an
// empty one are told apart.
func storedLane(t *testing.T, ctx context.Context, coll *mongodriver.Collection, id, lane string) bson.A {
	t.Helper()

	var stored bson.M
	if err := coll.FindOne(ctx, bson.M{"_id": id}).Decode(&stored); err != nil {
		t.Fatalf("read %s: %v", id, err)
	}
	held, _ := stored[lane].(bson.A)
	return held
}

// assertMarketMoved holds the move's whole promise for one row: it is on the
// market lane under the id it already had, and it is no longer among the
// structures. The id above all — a job setup naming a market keeps working only
// while the id does not change.
func assertMarketMoved(t *testing.T, ctx context.Context, coll *mongodriver.Collection, docID, marketID string) {
	t.Helper()

	if !laneHolds(storedLane(t, ctx, coll, docID, "marketLocations"), marketID) {
		t.Errorf("%s: %q is not on the market lane", docID, marketID)
	}
	if laneHolds(storedLane(t, ctx, coll, docID, "customStructures"), marketID) {
		t.Errorf("%s: %q is still among the custom structures", docID, marketID)
	}
}

func laneHolds(lane bson.A, id string) bool {
	for _, row := range lane {
		held, ok := row.(bson.M)
		if ok && held["id"] == id {
			return true
		}
	}
	return false
}
