package planners

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/natsfake"
	"eve-industry-planner/testing/redisfake"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Saving a planner's markets, through the handler and out to the document.
//
// The refusal tests above reach the handler body with no Mongo behind them,
// which is what proves they refuse before writing; they cannot say what a write
// that goes through does. This does: that the markets reach the stored document,
// that the response carries them back, and that the ones an organisation shares
// are asked to be priced while the ones it keeps to itself are not.
// Requires EIP_MONGO_PARITY_LIVE=1.

const marketSettingsAccount = "eip-parity-settings-markets"

// settingsHandlers wires the handler to live Mongo and in-process fakes for the
// two things a save reaches beyond it.
func settingsHandlers(t *testing.T, mongo *eipmongo.Mongo) (*Handlers, *natsfake.NATS, *eipredis.Redis) {
	t.Helper()

	nats := natsfake.New(t)
	if _, err := nats.NATS.Tasks.Ensure(t.Context()); err != nil {
		t.Fatalf("ensure task stream: %v", err)
	}
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	return New(&apideps.Deps{
		Mongo: mongo,
		Redis: redis,
		NATS:  nats.NATS,
	}), nats, redis
}

// seedMarketPlanner makes a planner the account is a member of, with a settings
// document to write into.
func seedMarketPlanner(t *testing.T, mongo *eipmongo.Mongo, handle string) models.Owner {
	t.Helper()

	owner := models.PlannerOwner(handle)
	drop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = mongo.Planners.Collection().DeleteMany(ctx, bson.M{"_id": owner.Key()})
		_, _ = mongo.PlannerMemberships.Collection().DeleteMany(ctx, bson.M{"plannerID": owner.Key()})
		_, _ = mongo.PlannerSettings.Collection().DeleteMany(ctx, bson.M{"_id": owner.Key()})
	}
	drop()
	t.Cleanup(drop)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := mongo.EnsurePlanner(ctx, owner, eipmongo.PlannerWrite{
		Name: handle, CreatedBy: marketSettingsAccount, Member: true,
	}, time.Now().UTC()); err != nil {
		t.Fatalf("seed planner: %v", err)
	}
	if err := mongo.EnsurePlannerSettings(ctx, owner, marketSettingsAccount, time.Now().UTC()); err != nil {
		t.Fatalf("seed planner settings: %v", err)
	}
	return owner
}

func TestLive_putPlannerSettings_savesMarketsAndAsksForTheSharedOnes(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	handlers, nats, _ := settingsHandlers(t, mongo)
	owner := seedMarketPlanner(t, mongo, "eip-parity-settings-planner")

	body := `{"marketLocations":[
		{"id":"shared-jita","name":"Jita","regionID":10000002,"stationID":60003760,"sharedWithMembers":true},
		{"id":"internal-amarr","name":"Amarr","regionID":10000043,"stationID":60008494,"sharedWithMembers":false}
	]}`

	rec := httptest.NewRecorder()
	handlers.PutPlannerSettingsHandler(rec,
		asAccountJSON(t, marketSettingsAccount, http.MethodPut,
			"/api/v1/planners/"+owner.Key()+"/settings", json.RawMessage(body)),
		owner.Key())

	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	var answered settingsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &answered); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(answered.Settings.MarketLocations) != 2 {
		t.Errorf("answered %d markets, want the two that were saved", len(answered.Settings.MarketLocations))
	}

	// What the next reader of this planner gets, rather than what this response
	// happened to carry.
	stored, seeded, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("read the settings back: %v", err)
	}
	if !seeded {
		t.Fatal("the planner has no settings document after a save")
	}
	byID := map[string]models.MarketLocation{}
	for _, row := range stored.MarketLocations {
		byID[row.ID] = row
	}
	if len(byID) != 2 || byID["shared-jita"].StationID != 60003760 ||
		byID["internal-amarr"].StationID != 60008494 {
		t.Fatalf("stored %+v, want both markets as they were sent", stored.MarketLocations)
	}
	if !byID["shared-jita"].SharedWithMembers || byID["internal-amarr"].SharedWithMembers {
		t.Errorf("stored %+v, want only the Jita row shared with members", stored.MarketLocations)
	}

	// A market an organisation shares is walked for its members; one kept
	// internal to the planner reaches nobody, so walking its region would be
	// work done for no reader.
	asked := trackedStationsAsked(t, nats)
	if len(asked) != 1 || asked[0] != 60003760 {
		t.Errorf("asked to price %v, want only the shared market's station", asked)
	}
}

// A citadel is saved like any other market and priced like none of them: its
// orders are read with a character's token on the reader's own device, so asking
// this server to walk for it would be a region walked for nobody. Saved beside a
// station so the answer cannot be "it asked for nothing at all".
func TestLive_putPlannerSettings_savesACitadelWithoutAskingTheServerToPriceIt(t *testing.T) {
	mongo := mongolive.Require(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	handlers, nats, _ := settingsHandlers(t, mongo)
	owner := seedMarketPlanner(t, mongo, "eip-parity-settings-citadel")

	rec := httptest.NewRecorder()
	handlers.PutPlannerSettingsHandler(rec,
		asAccountJSON(t, marketSettingsAccount, http.MethodPut,
			"/api/v1/planners/"+owner.Key()+"/settings",
			json.RawMessage(`{"marketLocations":[
				{"id":"shared-azbel","name":"An Azbel","regionID":10000030,"structureID":1035466617946,"sharedWithMembers":true},
				{"id":"shared-jita","name":"Jita","regionID":10000002,"stationID":60003760,"sharedWithMembers":true}
			]}`)),
		owner.Key())
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	stored, _, err := mongo.LoadPlannerSettings(ctx, owner)
	if err != nil {
		t.Fatalf("read the settings back: %v", err)
	}
	if len(stored.MarketLocations) != 2 {
		t.Fatalf("stored %+v, want both markets", stored.MarketLocations)
	}

	asked := trackedStationsAsked(t, nats)
	if len(asked) != 1 || asked[0] != 60003760 {
		t.Errorf("asked to price %v, want the station alone and never the citadel", asked)
	}
}

// A market this server already prices asks for nothing on a save. The question
// is asked of what the worker recorded, not of what this handler published
// before: a save that republished every time would put a walk of a whole region
// behind each one, and most saves change no market at all.
func TestLive_putPlannerSettings_aMarketAlreadyPricedAsksForNothing(t *testing.T) {
	mongo := mongolive.Require(t)

	handlers, nats, redis := settingsHandlers(t, mongo)
	owner := seedMarketPlanner(t, mongo, "eip-parity-settings-resave")

	// As the worker leaves it once it has registered the market.
	if err := redis.MarketOrders().TrackStation(t.Context(), 10000002, 60003760, time.Now()); err != nil {
		t.Fatalf("track the station: %v", err)
	}

	rec := httptest.NewRecorder()
	handlers.PutPlannerSettingsHandler(rec,
		asAccountJSON(t, marketSettingsAccount, http.MethodPut,
			"/api/v1/planners/"+owner.Key()+"/settings",
			json.RawMessage(`{"marketLocations":[
				{"id":"shared-jita","name":"Jita","regionID":10000002,"stationID":60003760,"sharedWithMembers":true}
			]}`)),
		owner.Key())
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	if asked := trackedStationsAsked(t, nats); len(asked) != 0 {
		t.Errorf("asked to price %v, want nothing for a market already priced", asked)
	}
}

// trackedStationsAsked reads the stations the handler asked to have priced, out
// of the task stream it published them to.
func trackedStationsAsked(t *testing.T, nats *natsfake.NATS) []int64 {
	t.Helper()

	stream, err := nats.NATS.Tasks.Ensure(t.Context())
	if err != nil {
		t.Fatalf("task stream: %v", err)
	}
	info, err := stream.Info(t.Context())
	if err != nil {
		t.Fatalf("stream info: %v", err)
	}

	stations := []int64{}
	for seq := uint64(1); seq <= info.State.LastSeq; seq++ {
		msg, err := stream.GetMsg(t.Context(), seq)
		if err != nil || msg.Subject != eipnats.TrackMarketSources.Subject {
			continue
		}
		var envelope struct {
			Data eipnats.MarketSourcesRequest `json:"data"`
		}
		if err := json.Unmarshal(msg.Data, &envelope); err != nil {
			t.Fatalf("decode a track request: %v", err)
		}
		stations = append(stations, envelope.Data.StationIDs...)
	}
	return stations
}
