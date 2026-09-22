package v1endpoints

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/api/marketsources"
	"eve-industry-planner/shared/jsoncodec"
	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
)

// The field carries two states a client has to tell apart: an account that has
// no markets, and an answer that could not be composed. The first is final, the
// second means ask the endpoint — a client that confused them would either
// re-request for ever or show a reader no markets over a fault.
//
// Encoded rather than reflected over: the surface fixture lists this path under
// any tag, so only running the codec says which state reaches the wire. An
// earlier `omitempty` here dropped both, because this codec follows the pointer.
func TestABootstrapTellsNoMarketsApartFromNoAnswer(t *testing.T) {
	none := models.MarketLocations{}

	for _, held := range []struct {
		label    string
		value    *models.MarketLocations
		wantPath bool
		wantJSON string
	}{
		{"an account with no markets", &none, true, `"market_locations":[]`},
		{"an answer that could not be composed", nil, false, ""},
	} {
		encoded, err := jsoncodec.Marshal(SessionBootstrapResponse{MarketLocations: held.value})
		if err != nil {
			t.Fatalf("%s: encode: %v", held.label, err)
		}

		carries := strings.Contains(string(encoded), "market_locations")
		if carries != held.wantPath {
			t.Errorf("%s: carries the field = %v, want %v\n%s",
				held.label, carries, held.wantPath, encoded)
			continue
		}
		if held.wantJSON != "" && !strings.Contains(string(encoded), held.wantJSON) {
			t.Errorf("%s: want %s in\n%s", held.label, held.wantJSON, encoded)
		}
	}
}

// Every path that hands markets to a client stamps when the server last walked
// them, and the wiring is what this covers: `StampPricedAt` has its own tests,
// but a producer that forgets to call it looks perfectly correct from both
// sides and was found by a reader looking at a panel rather than by a test.
//
// The bootstrap is the path a fresh sign-in arrives on, so a market unstamped
// here reads as never walked for the whole session.
func TestABootstrapSaysWhenEachMarketWasLastWalked(t *testing.T) {
	walked := time.Now().Add(-time.Hour).UTC().Truncate(time.Millisecond)
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	if err := redis.MarketOrders().PutRefreshTime(t.Context(), 10000002, walked); err != nil {
		t.Fatalf("record the walk: %v", err)
	}

	stamped := marketsources.StampPricedAt(t.Context(), redis, models.MarketLocations{
		{ID: "mkt-1", Name: "Jita", RegionID: 10000002, StationID: 60003760},
	})

	encoded, err := jsoncodec.Marshal(SessionBootstrapResponse{MarketLocations: &stamped})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	want := fmt.Sprintf(`"pricedAt":%d`, walked.UnixMilli())
	if !strings.Contains(string(encoded), want) {
		t.Errorf("want %s on the wire, in\n%s", want, encoded)
	}
}

// A market this server has not walked says nothing rather than stating the
// epoch, which a panel would print as a moment in 1970.
func TestAMarketNeverWalkedCarriesNoMoment(t *testing.T) {
	encoded, err := jsoncodec.Marshal(SessionBootstrapResponse{
		MarketLocations: &models.MarketLocations{
			{ID: "mkt-1", Name: "Jita", RegionID: 10000002, StationID: 60003760},
		},
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if strings.Contains(string(encoded), "pricedAt") {
		t.Errorf("a market never walked states a moment anyway, in\n%s", encoded)
	}
}
