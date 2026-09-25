package esi_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/esifake"
	esi "eve-industry-planner/worker/tasks/esi"
)

// The whole life of a market a reader saved, from the request the API publishes
// when they save it to the figures a priced surface reads back, and on to the
// market being retired once nobody asks about it any more.
//
// Each step is covered on its own elsewhere; what only this can say is that they
// join up — that what registration leaves behind is what the walk looks for,
// that what the walk stores is what the derive prices from, and that the derive
// keys prices where retrieval reads them. A break at any of those seams leaves
// every unit test passing and a reader with no figures.
//
// It starts from `eipnats.MarketSourcesRequest` because that is the seam: the
// API publishes it on a settings save and at sign-in, and the worker knows
// nothing else about how a market came to be wanted.

const lifecycleType = int32(34)

// lifecycleDeps answers the universe chain a station resolves through, and
// serves one page of orders at the station for the region walk.
func lifecycleDeps(t *testing.T) (*taskDeps, *esifake.Client) {
	t.Helper()

	esiFake := esifake.New(t)
	esiFake.SetJSON(http.MethodGet, "/universe/stations/60004588/", http.StatusOK, `{"system_id":30002510}`)
	esiFake.SetJSON(http.MethodGet, "/universe/systems/30002510/", http.StatusOK, `{"constellation_id":20000371}`)
	esiFake.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)
	esiFake.Set(http.MethodGet, fmt.Sprintf("/markets/%d/orders/", unaskedRegion), esifake.Reply{
		Status: http.StatusOK,
		Body: fmt.Sprintf(`[
			{"type_id":%d,"location_id":%d,"price":5.0,"is_buy_order":true,"volume_remain":100},
			{"type_id":%d,"location_id":%d,"price":9.0,"is_buy_order":false,"volume_remain":100}
		]`, lifecycleType, unaskedStation, lifecycleType, unaskedStation),
	})

	return newTaskDeps(t, esiFake), esiFake
}

func TestASavedMarketIsRegisteredWalkedPricedAndRetired(t *testing.T) {
	deps, esiFake := lifecycleDeps(t)
	orders := deps.deps.Redis.MarketOrders()

	// Saving a market asks for it to be priced. The first station in a region
	// pays for that region's walk, so registration asks for the walk rather than
	// a derive that would have nothing to read.
	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register the saved market: %v", err)
	}

	asked := deps.published(t)
	if !slices.Contains(asked, eipnats.RefreshRegionMarketOrders.Subject) {
		t.Fatalf("registering the first market in a region asked for %v, want a region walk", asked)
	}

	// The walk is ESI-bound and knows nothing about who wants the region, so it
	// stores pages and asks for them to be priced.
	if err := esi.RefreshRegionMarketOrders(t.Context(),
		eipnats.RegionMarketOrdersRequest{RegionID: unaskedRegion}, deps.deps); err != nil {
		t.Fatalf("walk the region: %v", err)
	}
	esiFake.AssertCalled(http.MethodGet, fmt.Sprintf("/markets/%d/orders/", unaskedRegion), 1)

	if err := esi.DeriveRegionMarketPrices(t.Context(),
		eipnats.RegionMarketPricesRequest{RegionID: unaskedRegion}, deps.deps); err != nil {
		t.Fatalf("derive the region's prices: %v", err)
	}

	// What a priced surface reads back, keyed where it looks for it.
	priced, err := orders.PricesAtLocation(t.Context(), unaskedStation, []int32{lifecycleType})
	if err != nil {
		t.Fatalf("read the market's prices: %v", err)
	}
	if priced[lifecycleType] == nil {
		t.Fatal("a market that was registered, walked and derived has no prices to read")
	}
	if priced[lifecycleType].Buy != 5 || priced[lifecycleType].Sell != 9 {
		t.Errorf("priced %+v, want the walked orders' buy 5 and sell 9", priced[lifecycleType])
	}

	// Nobody has asked about it for a fortnight, so it stops being swept.
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation,
		time.Now().Add(-30*24*time.Hour)); err != nil {
		t.Fatalf("age the market: %v", err)
	}
	if err := esi.RetireUnaskedMarkets(t.Context(), deps.deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	tracked, err := orders.TrackedStations(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("read tracked stations: %v", err)
	}
	if len(tracked) != 0 {
		t.Errorf("tracked %+v after retirement, want the market swept", tracked)
	}
}

// Signing in again with a market this server already prices asks for no work.
// This runs on every sign-in and every settings save, most of which change no
// market at all, so a registration that republished each time would put a walk
// of a whole region behind every one of them.
func TestRegisteringAMarketAlreadyPricedAsksForNothing(t *testing.T) {
	deps, _ := lifecycleDeps(t)

	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register: %v", err)
	}
	if err := esi.RefreshRegionMarketOrders(t.Context(),
		eipnats.RegionMarketOrdersRequest{RegionID: unaskedRegion}, deps.deps); err != nil {
		t.Fatalf("walk: %v", err)
	}
	before := len(deps.published(t))

	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register again: %v", err)
	}

	if after := len(deps.published(t)); after != before {
		t.Errorf("registering a market already priced asked for %d more jobs, want none", after-before)
	}
}

// A market retired for want of interest is priced again from the pages the walk
// left behind, without a second walk of the region. The pages outlive the
// registration on purpose: a reader who comes back inside that window costs
// nothing at ESI.
func TestAMarketComingBackIsPricedWithoutWalkingAgain(t *testing.T) {
	deps, esiFake := lifecycleDeps(t)
	orders := deps.deps.Redis.MarketOrders()
	ordersPath := fmt.Sprintf("/markets/%d/orders/", unaskedRegion)

	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register: %v", err)
	}
	if err := esi.RefreshRegionMarketOrders(t.Context(),
		eipnats.RegionMarketOrdersRequest{RegionID: unaskedRegion}, deps.deps); err != nil {
		t.Fatalf("walk: %v", err)
	}
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation,
		time.Now().Add(-30*24*time.Hour)); err != nil {
		t.Fatalf("age the market: %v", err)
	}
	if err := esi.RetireUnaskedMarkets(t.Context(), deps.deps); err != nil {
		t.Fatalf("retire: %v", err)
	}
	walks := len(esiFake.CallsTo(http.MethodGet, ordersPath))

	// Saved again, which is the same request the API publishes the first time.
	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register again: %v", err)
	}
	if err := esi.DeriveRegionMarketPrices(t.Context(),
		eipnats.RegionMarketPricesRequest{RegionID: unaskedRegion}, deps.deps); err != nil {
		t.Fatalf("derive again: %v", err)
	}

	priced, err := orders.PricesAtLocation(t.Context(), unaskedStation, []int32{lifecycleType})
	if err != nil {
		t.Fatalf("read prices: %v", err)
	}
	if priced[lifecycleType] == nil {
		t.Fatal("a market saved again was not priced from the pages left behind")
	}
	if again := len(esiFake.CallsTo(http.MethodGet, ordersPath)); again != walks {
		t.Errorf("walked the region %d more times, want the stored pages used", again-walks)
	}
}
