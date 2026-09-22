package esi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/httpclient"
	"eve-industry-planner/shared/jsoncodec"
	eipredis "eve-industry-planner/shared/redis"
)

// NPC station ids occupy their own range in CCP's published id table, which is
// what lets a station be told from a citadel, a system or a type without asking
// ESI about it first.
const (
	stationIDFloor   = 60_000_000
	stationIDCeiling = 64_000_000
)

const (
	// stationRegionLifetime is no expiry at all: which region a station sits in
	// is fixed for the life of the universe's map, so a resolved answer never
	// needs re-asking.
	stationRegionLifetime time.Duration = 0

	// An id ESI does not know is remembered briefly: most of the station range is
	// unassigned, and asking about one otherwise costs a call every time it is
	// named.
	unknownStationLifetime = 10 * time.Minute
)

// unknownStation is what a remembered refusal stores. A region id is never
// negative, so it cannot be mistaken for an answer.
const unknownStation int64 = -1

func stationRegionKey(stationID int64) string {
	return fmt.Sprintf("esi:station_region:%d", stationID)
}

// IsStationID reports whether an id is an NPC station's.
func IsStationID(id int64) bool { return id >= stationIDFloor && id < stationIDCeiling }

// RegionOfStation answers which region's order book carries one NPC station.
//
// The chain is three public calls — station to system, system to constellation,
// constellation to region — and the answer is cached without expiry because a
// station never moves. A station id that ESI does not know errors rather than
// resolving to nothing, so a mistyped id cannot register a market.
//
// Only ESI answering 404 about the station itself is remembered as unknown: a
// timeout, a 5xx or a later hop failing says nothing about whether the station
// is real, and remembering one would refuse a reader's market over a hiccup.
func RegionOfStation(ctx context.Context, client esiclient.API, r *eipredis.Redis, stationID int64) (int64, error) {
	if !IsStationID(stationID) {
		return 0, fmt.Errorf("%d is not an NPC station id", stationID)
	}

	key := stationRegionKey(stationID)
	cacheable := r != nil && r.Driver() != nil
	if cacheable {
		var cached int64
		if err := r.GetJSON(ctx, key, &cached); err == nil {
			if cached == unknownStation {
				return 0, fmt.Errorf("ESI does not know station %d", stationID)
			}
			if cached != 0 {
				return cached, nil
			}
		}
	}

	rememberIfUnknown := func(err error) error {
		var answered statusError
		if cacheable && errors.As(err, &answered) && answered.Status == http.StatusNotFound {
			_ = r.PutJSON(ctx, key, unknownStation, unknownStationLifetime)
		}
		return err
	}

	var station struct {
		SystemID int32 `json:"system_id"`
	}
	if err := publicGet(ctx, client, fmt.Sprintf("/universe/stations/%d/", stationID), &station); err != nil {
		return 0, rememberIfUnknown(err)
	}

	var system struct {
		ConstellationID int32 `json:"constellation_id"`
	}
	if err := publicGet(ctx, client, fmt.Sprintf("/universe/systems/%d/", station.SystemID), &system); err != nil {
		return 0, err
	}

	var constellation struct {
		RegionID int64 `json:"region_id"`
	}
	if err := publicGet(ctx, client, fmt.Sprintf("/universe/constellations/%d/", system.ConstellationID), &constellation); err != nil {
		return 0, err
	}
	if constellation.RegionID == 0 {
		return 0, fmt.Errorf("station %d resolved to no region", stationID)
	}

	if cacheable {
		_ = r.PutJSON(ctx, key, constellation.RegionID, stationRegionLifetime)
	}
	return constellation.RegionID, nil
}

// statusError is ESI answering something other than 200, carrying the status so
// a caller can tell "there is no such object" from "ask again later".
type statusError struct {
	Status int
	Path   string
}

func (e statusError) Error() string {
	return fmt.Sprintf("unexpected status %d from %s", e.Status, e.Path)
}

// publicGet reads one unauthenticated universe endpoint into target.
//
// Background class: registering a market is work the server decided to do, and
// nothing is waiting on it. Spending from the user-requested budget would have it
// compete with the reads a reader is actually held up by.
func publicGet(ctx context.Context, client esiclient.API, path string, target any) error {
	if client == nil {
		return fmt.Errorf("ESI client is nil")
	}

	response, err := client.Do(ctx, esiclient.Request{
		Method: http.MethodGet,
		Path:   path,
		Class:  esiclient.ClassBackground,
		Retry:  httpclient.DefaultRetry(),
	})
	if err != nil {
		return err
	}
	if response.Status != http.StatusOK {
		return statusError{Status: response.Status, Path: path}
	}
	return jsoncodec.Unmarshal(response.Body, target)
}
