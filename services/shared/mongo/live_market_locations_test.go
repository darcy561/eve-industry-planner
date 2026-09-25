package mongo_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/models/planner"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/mongolive"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// MarketLocationsForAccount against real documents: it reads an account's
// settings, walks the planners it holds a membership for, and asks
// ComposeMarketLocations to fold them once. The collapsing rule is unit-tested
// where it lives; what only this can say is that the orchestration hands it the
// right documents, and what it does about the ones it cannot use.
// Requires EIP_MONGO_PARITY_LIVE=1.

const marketLocationsAccount = "eip-parity-market-locations"

func marketLocationRow(id string, stationID int64, shared bool) models.MarketLocation {
	return models.MarketLocation{
		ID:                id,
		Name:              id,
		RegionID:          10000002,
		StationID:         stationID,
		SharedWithMembers: shared,
	}
}

// A citadel is the other kind of saved market: a structure rather than a
// station, priced on the reader's device rather than by this server.
func citadelRow(id string, structureID int64, shared bool) models.MarketLocation {
	return models.MarketLocation{
		ID:                id,
		Name:              id,
		RegionID:          10000030,
		StructureID:       structureID,
		SharedWithMembers: shared,
	}
}

// seedAccountMarkets writes the account's own settings document carrying rows.
func seedAccountMarkets(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo, rows models.MarketLocations) {
	t.Helper()

	coll := mongo.ApplicationSettings.Collection()
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = coll.DeleteOne(cctx, bson.M{"_id": marketLocationsAccount})
	})

	doc := models.DefaultApplicationSettings(marketLocationsAccount, time.Now().UTC())
	doc.MarketLocations = rows
	seed, err := eipmongo.StructToMongoDoc(doc, marketLocationsAccount)
	if err != nil {
		t.Fatalf("build the account's settings: %v", err)
	}
	if _, err := coll.ReplaceOne(ctx, bson.M{"_id": marketLocationsAccount}, seed,
		options.Replace().SetUpsert(true)); err != nil {
		t.Fatalf("seed the account's settings: %v", err)
	}
}

// seedPlannerWithMarkets creates a planner the account is a member of, and
// optionally gives it a settings document holding rows. Passing nil rows and
// seedSettings false is how a planner with no settings document at all is made.
func seedPlannerWithMarkets(t *testing.T, ctx context.Context, mongo *eipmongo.Mongo,
	handle string, rows models.MarketLocations, seedSettings bool) models.Owner {
	t.Helper()

	owner := models.PlannerOwner(handle)
	plannerColl := mongo.Planners.Collection()
	settingsColl := mongo.PlannerSettings.Collection()
	t.Cleanup(func() {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = plannerColl.DeleteOne(cctx, bson.M{"_id": owner.Key()})
		_, _ = settingsColl.DeleteOne(cctx, bson.M{"_id": owner.Key()})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(cctx,
			bson.M{"plannerID": owner.Key()})
	})

	if _, err := mongo.EnsurePlanner(ctx, owner, eipmongo.PlannerWrite{
		Name: handle, CreatedBy: marketLocationsAccount, Member: true,
	}, time.Now().UTC()); err != nil {
		t.Fatalf("seed planner %s: %v", handle, err)
	}

	if !seedSettings {
		cctx, c := context.WithTimeout(context.Background(), 30*time.Second)
		defer c()
		_, _ = settingsColl.DeleteOne(cctx, bson.M{"_id": owner.Key()})
		return owner
	}

	if err := mongo.EnsurePlannerSettings(ctx, owner, marketLocationsAccount, time.Now().UTC()); err != nil {
		t.Fatalf("seed planner settings for %s: %v", handle, err)
	}
	if rows != nil {
		update := planner.SettingsUpdate{MarketLocations: &rows}
		if _, err := mongo.UpdatePlannerSettings(ctx, owner, update, models.MetaData{},
			time.Now().UTC()); err != nil {
			t.Fatalf("write planner markets for %s: %v", handle, err)
		}
	}
	return owner
}

func TestLive_marketLocationsForAccount_composesOwnAndShared(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{
		marketLocationRow("own-jita", 60003760, false),
	})
	owner := seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-shared", models.MarketLocations{
		marketLocationRow("planner-amarr", 60008494, true),
	}, true)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("MarketLocationsForAccount: %v", err)
	}

	byID := map[string]models.MarketLocation{}
	for _, row := range composed {
		byID[row.ID] = row
	}
	if _, held := byID["own-jita"]; !held {
		t.Errorf("composed %+v, want the account's own market in it", composed)
	}
	shared, held := byID["planner-amarr"]
	if !held {
		t.Fatalf("composed %+v, want the planner's shared market in it", composed)
	}
	// A panel says where a market came from, and the id alone cannot tell a
	// market the reader saved from one that reached them.
	if shared.SharedBy != owner.Key() {
		t.Errorf("shared market names %q as its owner, want %q", shared.SharedBy, owner.Key())
	}
}

// A market a planner keeps to itself is not one of its members' markets: the
// tick is what gives it to them, so adding one is not the same act as sharing it.
func TestLive_marketLocationsForAccount_leavesOutAnUnsharedPlannerMarket(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{})
	seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-private", models.MarketLocations{
		marketLocationRow("planner-internal", 60008494, false),
	}, true)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("MarketLocationsForAccount: %v", err)
	}

	for _, row := range composed {
		if row.ID == "planner-internal" {
			t.Fatalf("composed %+v, want a market kept internal to the planner left out", composed)
		}
	}
}

// A planner with no settings document is left out silently — it has nothing to
// contribute, and it is not a failure worth refusing the whole set over.
func TestLive_marketLocationsForAccount_skipsAPlannerWithNoSettings(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{
		marketLocationRow("own-jita", 60003760, false),
	})
	seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-unseeded", nil, false)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("a planner with no settings refused the whole set: %v", err)
	}
	if len(composed) != 1 || composed[0].ID != "own-jita" {
		t.Errorf("composed %+v, want only the account's own market", composed)
	}
}

// Two saved markets naming one place collapse to one, and the account's own row
// is the one that survives — a reader's own naming of a place beats an
// organisation's.
func TestLive_marketLocationsForAccount_keepsTheAccountsOwnRowForOnePlace(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{
		marketLocationRow("own-amarr", 60008494, false),
	})
	seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-duplicate", models.MarketLocations{
		marketLocationRow("planner-amarr", 60008494, true),
	}, true)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("MarketLocationsForAccount: %v", err)
	}

	atAmarr := models.MarketLocations{}
	for _, row := range composed {
		if row.StationID == 60008494 {
			atAmarr = append(atAmarr, row)
		}
	}
	if len(atAmarr) != 1 {
		t.Fatalf("one place is saved %d times, want it collapsed: %+v", len(atAmarr), atAmarr)
	}
	if atAmarr[0].ID != "own-amarr" {
		t.Errorf("kept %q for the place, want the account's own row", atAmarr[0].ID)
	}
}

func TestLive_marketLocationsForAccount_refusesWithoutAnAccount(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if _, err := mongo.MarketLocationsForAccount(ctx, "", time.Now().UTC()); err == nil {
		t.Error("an empty account id was accepted, want a refusal")
	}
	var absent *eipmongo.Mongo
	if _, err := absent.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC()); err == nil {
		t.Error("a nil handle was accepted, want a refusal")
	}
}

// Both kinds of market compose alike. A citadel is told apart from a station by
// where it is, not by what composes it, so an organisation sharing one reaches
// its members the same way — and a station and a citadel are never each other's
// duplicate however their ids happen to fall.
func TestLive_marketLocationsForAccount_composesCitadelsBesideStations(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{
		marketLocationRow("own-jita", 60003760, false),
		citadelRow("own-azbel", 1035466617946, false),
	})
	seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-citadel", models.MarketLocations{
		citadelRow("planner-sotiyo", 1035466617947, true),
	}, true)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("MarketLocationsForAccount: %v", err)
	}

	byID := map[string]models.MarketLocation{}
	for _, row := range composed {
		byID[row.ID] = row
	}
	for _, want := range []string{"own-jita", "own-azbel", "planner-sotiyo"} {
		if _, held := byID[want]; !held {
			t.Errorf("composed %+v, want %q in it", composed, want)
		}
	}
	if byID["own-azbel"].StationID != 0 || byID["own-jita"].StructureID != 0 {
		t.Errorf("a citadel and a station were composed into each other: %+v", composed)
	}
}

// One citadel saved twice is one market, the same as one station saved twice —
// the place a market names is what makes it a duplicate, whichever kind it is.
func TestLive_marketLocationsForAccount_collapsesOneCitadelSavedTwice(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	seedAccountMarkets(t, ctx, mongo, models.MarketLocations{
		citadelRow("own-azbel", 1035466617946, false),
	})
	seedPlannerWithMarkets(t, ctx, mongo, "eip-parity-ml-citadel-dup", models.MarketLocations{
		citadelRow("planner-azbel", 1035466617946, true),
	}, true)

	composed, err := mongo.MarketLocationsForAccount(ctx, marketLocationsAccount, time.Now().UTC())
	if err != nil {
		t.Fatalf("MarketLocationsForAccount: %v", err)
	}

	atTheAzbel := models.MarketLocations{}
	for _, row := range composed {
		if row.StructureID == 1035466617946 {
			atTheAzbel = append(atTheAzbel, row)
		}
	}
	if len(atTheAzbel) != 1 {
		t.Fatalf("one citadel is saved %d times, want it collapsed: %+v", len(atTheAzbel), atTheAzbel)
	}
	if atTheAzbel[0].ID != "own-azbel" {
		t.Errorf("kept %q for the citadel, want the account's own row", atTheAzbel[0].ID)
	}
}
