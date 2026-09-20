package esi

import (
	"net/http"
	"testing"

	"eve-industry-planner/shared/esiclient"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/esifake"
	"eve-industry-planner/testing/redisfake"
)

// Most of the station id range is unassigned, and this endpoint is reached
// without a session. An id ESI does not know must cost one call rather than one
// per ask, or asking about nothing repeatedly is free load on the class a reader
// waiting for a price spends from.
func TestAnIDESIDoesNotKnowIsAskedAboutOnce(t *testing.T) {
	const missing = int64(60999999)

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.SetJSON(http.MethodGet, "/universe/stations/60999999/", http.StatusNotFound, `{"error":"Not found"}`)

	for range 3 {
		if _, err := RegionOfStation(t.Context(), esi, redis, missing); err == nil {
			t.Fatal("an id ESI does not know resolved to a region")
		}
	}

	if calls := esi.CallsTo(http.MethodGet, "/universe/stations/60999999/"); len(calls) != 1 {
		t.Errorf("asked ESI %d times about an id it does not know, want once", len(calls))
	}
}

// A station that resolves is remembered without expiry: it never moves, so a
// second ask must cost nothing at all.
func TestAResolvedStationIsAskedAboutOnce(t *testing.T) {
	const rens = int64(60004588)

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.SetJSON(http.MethodGet, "/universe/stations/60004588/", http.StatusOK, `{"system_id":30002510}`)
	esi.SetJSON(http.MethodGet, "/universe/systems/30002510/", http.StatusOK, `{"constellation_id":20000371}`)
	esi.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)

	for range 3 {
		regionID, err := RegionOfStation(t.Context(), esi, redis, rens)
		if err != nil {
			t.Fatalf("resolve: %v", err)
		}
		if regionID != 10000030 {
			t.Fatalf("region = %d, want 10000030", regionID)
		}
	}

	if calls := esi.Calls(); len(calls) != 3 {
		t.Errorf("made %d ESI calls for three asks, want the three of one walk", len(calls))
	}
}

// An id outside CCP's station range never reaches ESI: a citadel, a type or a
// system id is not a station, and asking about it would spend a call to learn
// what the id itself says.
func TestAnIDOutsideTheStationRangeNeverReachesESI(t *testing.T) {
	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)

	for _, id := range []int64{34, 30000142, 1035466617946} {
		if _, err := RegionOfStation(t.Context(), esi, redis, id); err == nil {
			t.Errorf("%d resolved to a region", id)
		}
	}
	if calls := esi.Calls(); len(calls) != 0 {
		t.Errorf("made %d ESI calls for ids that are not stations", len(calls))
	}
}

// A failure that says nothing about the station must not be remembered as
// "there is no such market": a reader's real market would be refused for ten
// minutes over an outage, which is worse than the repeated call the cache exists
// to stop.
func TestATransientFailureIsNotRememberedAsAnUnknownStation(t *testing.T) {
	const rens = int64(60004588)

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.Queue(http.MethodGet, "/universe/stations/60004588/",
		esifake.Reply{Status: http.StatusBadGateway, Body: `{"error":"backend error"}`},
		esifake.Reply{Status: http.StatusOK, Body: `{"system_id":30002510}`},
	)
	esi.SetJSON(http.MethodGet, "/universe/systems/30002510/", http.StatusOK, `{"constellation_id":20000371}`)
	esi.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)

	if _, err := RegionOfStation(t.Context(), esi, redis, rens); err == nil {
		t.Fatal("a failing call resolved to a region")
	}

	regionID, err := RegionOfStation(t.Context(), esi, redis, rens)
	if err != nil {
		t.Fatalf("the station was refused after a transient failure: %v", err)
	}
	if regionID != 10000030 {
		t.Errorf("region = %d, want 10000030", regionID)
	}
}

// A later hop failing says nothing about the station either, so it is not
// remembered: the station exists, and the walk simply did not finish.
func TestAFailureAfterTheStationHopIsNotRemembered(t *testing.T) {
	const rens = int64(60004588)

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.SetJSON(http.MethodGet, "/universe/stations/60004588/", http.StatusOK, `{"system_id":30002510}`)
	esi.Queue(http.MethodGet, "/universe/systems/30002510/",
		esifake.Reply{Status: http.StatusNotFound, Body: `{"error":"Not found"}`},
		esifake.Reply{Status: http.StatusOK, Body: `{"constellation_id":20000371}`},
	)
	esi.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)

	if _, err := RegionOfStation(t.Context(), esi, redis, rens); err == nil {
		t.Fatal("a failed walk resolved to a region")
	}
	if _, err := RegionOfStation(t.Context(), esi, redis, rens); err != nil {
		t.Errorf("the station was refused after its system lookup failed once: %v", err)
	}
}

// Registering a market is work the server decided to do. Spending from the
// user-requested budget would have it compete with the reads a reader is
// actually held up by.
func TestResolvingAStationSpendsFromTheBackgroundBudget(t *testing.T) {
	const rens = int64(60004588)

	redis := eipredis.NewRedis(redisfake.New(t).Client)
	esi := esifake.New(t)
	esi.SetJSON(http.MethodGet, "/universe/stations/60004588/", http.StatusOK, `{"system_id":30002510}`)
	esi.SetJSON(http.MethodGet, "/universe/systems/30002510/", http.StatusOK, `{"constellation_id":20000371}`)
	esi.SetJSON(http.MethodGet, "/universe/constellations/20000371/", http.StatusOK, `{"region_id":10000030}`)

	if _, err := RegionOfStation(t.Context(), esi, redis, rens); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	for _, call := range esi.Calls() {
		if call.Class != esiclient.ClassBackground {
			t.Errorf("%s was asked as %s, want background", call.Path, call.Class)
		}
	}
}
