package esi_test

import (
	"slices"
	"testing"
	"time"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/worker/taskrun"
	esi "eve-industry-planner/worker/tasks/esi"
)

// Rens, which no default hub sits in.
const (
	unaskedRegion  = int64(10000030)
	unaskedStation = int64(60004588)
)

func retirementDeps(t *testing.T) (*taskrun.Dependencies, *objectstore.MarketPages, *objectstore.MemoryBackend) {
	t.Helper()

	backend := objectstore.NewMemoryBackend()
	pages := objectstore.NewMarketPages(backend)
	return &taskrun.Dependencies{
		Redis:       eipredis.NewRedis(redisfake.New(t).Client),
		MarketPages: pages,
	}, pages, backend
}

// A market nobody has asked about in a fortnight stops being swept. Its pages
// stays until age takes it, so a reader who comes back inside that window is
// priced from pages that are already stored.
func TestAMarketNobodyAsksAboutIsRetired(t *testing.T) {
	deps, pages, _ := retirementDeps(t)
	orders := deps.Redis.MarketOrders()

	longAgo := time.Now().Add(-30 * 24 * time.Hour)
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, longAgo); err != nil {
		t.Fatalf("track station: %v", err)
	}
	if err := pages.Put(t.Context(), unaskedRegion, 1, []string{}); err != nil {
		t.Fatalf("store a page: %v", err)
	}

	if err := esi.RetireUnaskedMarkets(t.Context(), deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	regions, err := orders.TrackedRegions(t.Context())
	if err != nil {
		t.Fatalf("tracked regions: %v", err)
	}
	if slices.Contains(regions, unaskedRegion) {
		t.Error("a region nobody asks about is still swept")
	}

	held, err := pages.PageNumbers(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("page numbers: %v", err)
	}
	if len(held) != 1 {
		t.Errorf("held %d pages, want the retired region's pages left to age out", len(held))
	}
}

// A region keeps its place while anything in it is still wanted: one abandoned
// market must not retire the market beside it.
func TestOneAbandonedMarketDoesNotRetireItsRegion(t *testing.T) {
	deps, _, _ := retirementDeps(t)
	orders := deps.Redis.MarketOrders()

	const stillWanted = int64(60004591)
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, time.Now().Add(-30*24*time.Hour)); err != nil {
		t.Fatalf("track the abandoned station: %v", err)
	}
	if err := orders.TrackStation(t.Context(), unaskedRegion, stillWanted, time.Now()); err != nil {
		t.Fatalf("track the wanted station: %v", err)
	}

	if err := esi.RetireUnaskedMarkets(t.Context(), deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	regions, err := orders.TrackedRegions(t.Context())
	if err != nil {
		t.Fatalf("tracked regions: %v", err)
	}
	if !slices.Contains(regions, unaskedRegion) {
		t.Fatal("a region with a market still being asked about was retired")
	}

	tracked, err := orders.TrackedStations(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 1 || tracked[0].StationID != stillWanted {
		t.Errorf("tracked %+v, want only the station still asked about", tracked)
	}
}

// The hubs are never retired. Every reader prices against them, so a quiet
// fortnight means the planner was quiet rather than that nobody wants Jita.
func TestTheHubsAreNeverRetired(t *testing.T) {
	deps, _, _ := retirementDeps(t)
	orders := deps.Redis.MarketOrders()

	longAgo := time.Now().Add(-90 * 24 * time.Hour)
	for _, hub := range models.DefaultMarketLocations {
		if err := orders.TrackStation(t.Context(), hub.RegionID, hub.StationID, longAgo); err != nil {
			t.Fatalf("track hub %s: %v", hub.ID, err)
		}
	}

	if err := esi.RetireUnaskedMarkets(t.Context(), deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	regions, err := orders.TrackedRegions(t.Context())
	if err != nil {
		t.Fatalf("tracked regions: %v", err)
	}
	for _, hub := range models.DefaultMarketLocations {
		if !slices.Contains(regions, hub.RegionID) {
			t.Errorf("hub %s was retired after a quiet spell", hub.ID)
		}
	}
}

// A reader asking about a market while the retirement pass is deciding about its
// region keeps both: the ask re-registers the station, and a pass that went on to
// delete anyway would wipe the registration and leave the walk it just asked for
// running for nobody.
func TestAMarketAskedForMidSweepIsKept(t *testing.T) {
	deps, pages, _ := retirementDeps(t)
	orders := deps.Redis.MarketOrders()

	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, time.Now().Add(-30*24*time.Hour)); err != nil {
		t.Fatalf("track station: %v", err)
	}
	if err := pages.Put(t.Context(), unaskedRegion, 1, []string{}); err != nil {
		t.Fatalf("store a page: %v", err)
	}

	// The order the race takes: the set empties, then the region is wanted again.
	if _, err := orders.DropStationsAskedBefore(t.Context(), unaskedRegion, time.Now()); err != nil {
		t.Fatalf("drop stations: %v", err)
	}
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, time.Now()); err != nil {
		t.Fatalf("re-track station: %v", err)
	}

	stopped, err := orders.StopTrackingRegionIfUnwanted(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("stop tracking: %v", err)
	}
	if stopped {
		t.Fatal("a region asked about again was retired anyway")
	}

	tracked, err := orders.TrackedStations(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(tracked) != 1 {
		t.Errorf("tracked %+v, want the station that was asked for again", tracked)
	}
}

// The backstop: pages left behind by a region retired without them are
// swept by age, because object storage expires nothing on its own.
func TestOrphanedPagesAreSweptByAge(t *testing.T) {
	deps, pages, backend := retirementDeps(t)

	const orphaned = int64(10000016)
	// Written a month ago, so the backstop's cutoff has passed by the time the sweep looks.
	backend.SetClock(func() time.Time { return time.Now().Add(-30 * 24 * time.Hour) })
	if err := pages.Put(t.Context(), orphaned, 1, []string{}); err != nil {
		t.Fatalf("store a page: %v", err)
	}
	backend.SetClock(time.Now)

	if err := esi.RetireUnaskedMarkets(t.Context(), deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	held, err := pages.PageNumbers(t.Context(), orphaned)
	if err != nil {
		t.Fatalf("page numbers: %v", err)
	}
	if len(held) != 0 {
		t.Errorf("%d pages were kept for a region nothing tracks", len(held))
	}
}

// A market asked for again after being retired costs no walk: its region is
// registered afresh and the pages retirement left in place price it. That window
// is what their own lifetime buys, and it is why retirement does not delete
// one.
func TestAMarketAskedForAfterRetirementIsPricedFromThePagesLeftBehind(t *testing.T) {
	deps, pages, _ := retirementDeps(t)
	orders := deps.Redis.MarketOrders()

	stored := []esiclient.MarketOrder{
		{TypeID: 34, LocationID: unaskedStation, Price: 5, IsBuyOrder: true},
		{TypeID: 34, LocationID: unaskedStation, Price: 9},
	}
	if err := pages.Put(t.Context(), unaskedRegion, 1, stored); err != nil {
		t.Fatalf("store a page: %v", err)
	}
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, time.Now().Add(-30*24*time.Hour)); err != nil {
		t.Fatalf("track station: %v", err)
	}
	if err := esi.RetireUnaskedMarkets(t.Context(), deps); err != nil {
		t.Fatalf("retire: %v", err)
	}

	// Asked for again, which is what the endpoint's registration does.
	if err := orders.TrackStation(t.Context(), unaskedRegion, unaskedStation, time.Now()); err != nil {
		t.Fatalf("re-track station: %v", err)
	}
	if err := esi.DeriveRegionMarketPrices(t.Context(),
		eipnats.RegionMarketPricesRequest{RegionID: unaskedRegion}, deps); err != nil {
		t.Fatalf("derive: %v", err)
	}

	priced, err := orders.PricesAtLocation(t.Context(), unaskedStation, []int32{34})
	if err != nil {
		t.Fatalf("read prices: %v", err)
	}
	if priced[34] == nil {
		t.Fatal("a market asked for again was not priced from the pages left behind")
	}
	if priced[34].Buy != 5 || priced[34].Sell != 9 {
		t.Errorf("priced %+v, want the stored orders' buy 5 and sell 9", priced[34])
	}
}
