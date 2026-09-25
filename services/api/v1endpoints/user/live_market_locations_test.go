package user

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
	sessionreq "eve-industry-planner/shared/plannersession/request"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/mongolive"
	"eve-industry-planner/testing/redisfake"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// The composed market set as a reader receives it, through the handler.
//
// The composing is proved against documents in `shared/mongo`, and the stamping
// on its own in `api/marketsources`. This is the one place they meet: the answer
// a reader gets carries both kinds of market, and only the kind this server
// prices carries a clock.
// Requires EIP_MONGO_PARITY_LIVE=1.

const marketLocationsAccount = "eip-parity-user-markets"

func marketLocationHandlers(t *testing.T, mongo *eipmongo.Mongo) (*Handlers, *eipredis.Redis) {
	t.Helper()
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	return New(&apideps.Deps{Mongo: mongo, Redis: redis}), redis
}

// seedAccountMarkets writes the account's own settings document carrying rows.
func seedAccountMarkets(t *testing.T, mongo *eipmongo.Mongo, rows models.MarketLocations) {
	t.Helper()

	coll := mongo.ApplicationSettings.Collection()
	drop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_, _ = coll.DeleteOne(ctx, bson.M{"_id": marketLocationsAccount})
	}
	drop()
	t.Cleanup(drop)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
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

func askForMarkets(t *testing.T, handlers *Handlers, accountID string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/v1/user/market-locations", nil)
	if accountID != "" {
		r = r.WithContext(sessionreq.WithIdentity(r.Context(), accountID, "sess-markets"))
	}
	rec := httptest.NewRecorder()
	handlers.MarketLocationsHandler(rec, r)
	return rec
}

func TestLive_marketLocations_answersBothKindsAndClocksOnlyWhatItPrices(t *testing.T) {
	mongo := mongolive.Require(t)
	handlers, redis := marketLocationHandlers(t, mongo)

	seedAccountMarkets(t, mongo, models.MarketLocations{
		{ID: "own-jita", Name: "Jita", RegionID: 10000002, StationID: 60003760},
		{ID: "own-azbel", Name: "An Azbel", RegionID: 10000030, StructureID: 1035466617946},
	})

	// As a region walk leaves it. The station's clock comes from its region;
	// the citadel's region is deliberately never walked, because nothing here
	// walks it — its orders are read on the reader's own device.
	walked := time.Now().UTC().Truncate(time.Millisecond)
	if err := redis.MarketOrders().PutRefreshTime(t.Context(), 10000002, walked); err != nil {
		t.Fatalf("record when the region was walked: %v", err)
	}

	rec := askForMarkets(t, handlers, marketLocationsAccount)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	var answered struct {
		MarketLocations []models.MarketLocation `json:"marketLocations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &answered); err != nil {
		t.Fatalf("decode the answer: %v", err)
	}

	byID := map[string]models.MarketLocation{}
	for _, row := range answered.MarketLocations {
		byID[row.ID] = row
	}
	if len(byID) != 2 {
		t.Fatalf("answered %+v, want both markets", answered.MarketLocations)
	}
	if byID["own-jita"].PricedAt != walked.UnixMilli() {
		t.Errorf("the station is clocked at %d, want the moment its region was walked (%d)",
			byID["own-jita"].PricedAt, walked.UnixMilli())
	}
	// A clock here would speak for a read this server never made.
	if byID["own-azbel"].PricedAt != 0 {
		t.Errorf("the citadel is clocked at %d, want no clock at all",
			byID["own-azbel"].PricedAt)
	}
}

// A market whose region has not been walked yet carries no clock either, which
// is what a market only just saved looks like.
func TestLive_marketLocations_leavesAMarketNotYetWalkedUnclocked(t *testing.T) {
	mongo := mongolive.Require(t)
	handlers, _ := marketLocationHandlers(t, mongo)

	seedAccountMarkets(t, mongo, models.MarketLocations{
		{ID: "own-jita", Name: "Jita", RegionID: 10000002, StationID: 60003760},
	})

	rec := askForMarkets(t, handlers, marketLocationsAccount)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}

	var answered struct {
		MarketLocations []models.MarketLocation `json:"marketLocations"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &answered); err != nil {
		t.Fatalf("decode the answer: %v", err)
	}
	if len(answered.MarketLocations) != 1 || answered.MarketLocations[0].PricedAt != 0 {
		t.Errorf("answered %+v, want the market unclocked", answered.MarketLocations)
	}
}

// An account with no markets is answered with an empty list rather than null:
// a reader with none and an answer that did not arrive are different facts, and
// the client tells them apart by one throwing.
func TestLive_marketLocations_answersNoMarketsAsAnEmptyList(t *testing.T) {
	mongo := mongolive.Require(t)
	handlers, _ := marketLocationHandlers(t, mongo)

	seedAccountMarkets(t, mongo, models.MarketLocations{})

	rec := askForMarkets(t, handlers, marketLocationsAccount)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != `{"marketLocations":[]}`+"\n" {
		t.Errorf("answered %q, want an empty list", got)
	}
}

func TestMarketLocationsRefusesBeforeItReads(t *testing.T) {
	t.Parallel()

	// A nil Mongo handle: reaching the read would panic rather than answering,
	// so a clean status is the assertion that it did not.
	handlers := New(&apideps.Deps{})

	t.Run("nobody signed in", func(t *testing.T) {
		if rec := askForMarkets(t, handlers, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("code = %d, want 401", rec.Code)
		}
	})

	t.Run("no database to read", func(t *testing.T) {
		rec := askForMarkets(t, handlers, marketLocationsAccount)
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("code = %d, want 503", rec.Code)
		}
	})

	t.Run("asked for by a method that does not read", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodPost, "/api/v1/user/market-locations", nil)
		r = r.WithContext(sessionreq.WithIdentity(r.Context(), marketLocationsAccount, "sess-markets"))
		rec := httptest.NewRecorder()
		handlers.MarketLocationsHandler(rec, r)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("code = %d, want 405", rec.Code)
		}
	})
}
