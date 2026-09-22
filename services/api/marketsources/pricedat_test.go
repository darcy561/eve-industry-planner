package marketsources_test

import (
	"testing"
	"time"

	"eve-industry-planner/api/marketsources"
	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
)

const theForge = 10000002

func walkedRedis(t *testing.T, at time.Time) *eipredis.Redis {
	t.Helper()

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	if err := redis.MarketOrders().PutRefreshTime(t.Context(), theForge, at); err != nil {
		t.Fatalf("record the walk: %v", err)
	}
	return redis
}

// The clock belongs to the region's walk, which a browser never sees on its own:
// it arrives with a price answer, so a client only learns it by asking for a
// price and only holds it until the tab closes.
func TestAStationSaysWhenItsRegionWasWalked(t *testing.T) {
	walked := time.Now().Add(-30 * time.Minute).UTC().Truncate(time.Millisecond)
	redis := walkedRedis(t, walked)

	stamped := marketsources.StampPricedAt(t.Context(), redis, models.MarketLocations{
		{ID: "mkt-1", Name: "Jita", RegionID: theForge, StationID: 60003760},
	})

	if stamped[0].PricedAt != walked.UnixMilli() {
		t.Errorf("pricedAt = %d, want the region's walk at %d", stamped[0].PricedAt, walked.UnixMilli())
	}
}

// A market saved a moment ago is registered and has not come round on the walk
// yet. Zero is that answer, and it is what lets a panel say so rather than
// claiming nobody has asked.
func TestARegionNeverWalkedSaysNothing(t *testing.T) {
	redis := walkedRedis(t, time.Now())

	stamped := marketsources.StampPricedAt(t.Context(), redis, models.MarketLocations{
		{ID: "mkt-1", Name: "Rens", RegionID: 10000030, StationID: 60004588},
	})

	if stamped[0].PricedAt != 0 {
		t.Errorf("pricedAt = %d, want nothing for a region never walked", stamped[0].PricedAt)
	}
}

// A citadel's orders are read with a character's token on the device that reads
// them, so this server's clocks say nothing about it — and a clock here would be
// read as though they did.
func TestACitadelCarriesNoWalkClock(t *testing.T) {
	redis := walkedRedis(t, time.Now())

	stamped := marketsources.StampPricedAt(t.Context(), redis, models.MarketLocations{
		{ID: "mkt-1", Name: "An Azbel", RegionID: theForge, StructureID: 1035466617946},
	})

	if stamped[0].PricedAt != 0 {
		t.Errorf("pricedAt = %d, want nothing for a market this server does not price", stamped[0].PricedAt)
	}
}

// The markets are the answer; when they were last priced is something a panel
// says alongside them, so a Redis that will not answer is not worth failing for.
func TestTheMarketsSurviveARedisThatCannotAnswer(t *testing.T) {
	markets := models.MarketLocations{
		{ID: "mkt-1", Name: "Jita", RegionID: theForge, StationID: 60003760},
	}

	stamped := marketsources.StampPricedAt(t.Context(), nil, markets)

	if len(stamped) != 1 || stamped[0].ID != "mkt-1" {
		t.Errorf("stamped = %+v, want the markets handed back", stamped)
	}
}
