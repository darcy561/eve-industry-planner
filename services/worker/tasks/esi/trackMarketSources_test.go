package esi_test

import (
	"net/http"
	"slices"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/esifake"
	esi "eve-industry-planner/worker/tasks/esi"
)

// registrationDeps answers the universe chain for Rens and carries the broker
// the registration asks its work through.
func registrationDeps(t *testing.T) (*taskDeps, *esifake.Client) {
	t.Helper()

	esiFake := esifake.New(t)
	esiFake.SetJSON(http.MethodGet, "/universe/stations/60004588/", http.StatusOK, `{"system_id":30002510}`)
	esiFake.SetJSON(http.MethodGet, "/universe/systems/30002510/", http.StatusOK, `{"constellation_id":20000371}`)
	esiFake.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)

	return newTaskDeps(t, esiFake), esiFake
}

// Registering is what puts a market in the sweep: the station joins the set a
// derive pass prices, and its region joins the regions the sweep walks.
func TestRegisteringAMarketPutsItInTheSweep(t *testing.T) {
	deps, _ := registrationDeps(t)

	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register: %v", err)
	}

	stations, err := deps.deps.Redis.MarketOrders().TrackedStations(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(stations) != 1 || stations[0].StationID != unaskedStation {
		t.Fatalf("tracked %+v, want station %d", stations, unaskedStation)
	}

	regions, err := deps.deps.Redis.MarketOrders().TrackedRegions(t.Context())
	if err != nil {
		t.Fatalf("tracked regions: %v", err)
	}
	if !slices.Contains(regions, unaskedRegion) {
		t.Errorf("tracked regions %v, want %d among them", regions, unaskedRegion)
	}
}

// One market an account cannot have must not cost it the rest, so a station
// that does not resolve is skipped rather than failing the pass.
func TestAMarketThatDoesNotResolveIsSkipped(t *testing.T) {
	deps, esiFake := registrationDeps(t)
	esiFake.SetJSON(http.MethodGet, "/universe/stations/60999999/", http.StatusNotFound, `{"error":"Not found"}`)

	if err := esi.TrackMarketSources(t.Context(),
		eipnats.MarketSourcesRequest{StationIDs: []int64{60999999, unaskedStation}}, deps.deps); err != nil {
		t.Fatalf("register: %v", err)
	}

	stations, err := deps.deps.Redis.MarketOrders().TrackedStations(t.Context(), unaskedRegion)
	if err != nil {
		t.Fatalf("tracked stations: %v", err)
	}
	if len(stations) != 1 || stations[0].StationID != unaskedStation {
		t.Errorf("tracked %+v, want the market that does resolve", stations)
	}
}

// Every sign-in registers the same markets again, so a market already in the
// sweep asks for no work at all.
func TestSigningInAgainAsksForNoWork(t *testing.T) {
	deps, _ := registrationDeps(t)
	request := eipnats.MarketSourcesRequest{StationIDs: []int64{unaskedStation}}

	if err := esi.TrackMarketSources(t.Context(), request, deps.deps); err != nil {
		t.Fatalf("first registration: %v", err)
	}
	before := len(deps.published(t))

	if err := esi.TrackMarketSources(t.Context(), request, deps.deps); err != nil {
		t.Fatalf("second registration: %v", err)
	}

	if after := len(deps.published(t)); after != before {
		t.Errorf("a second registration published %d more tasks, want none", after-before)
	}
}
