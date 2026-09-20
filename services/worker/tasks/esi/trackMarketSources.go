package esi

import (
	"context"
	"fmt"
	"time"

	esicore "eve-industry-planner/shared/core/esi"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"
)

// TrackMarketSources registers the markets an account prices against, so their
// books are swept from now on.
//
// Registering is what puts a market in the sweep, and it happens when an account
// signs in or saves a market rather than when a price is asked for: the first
// market in a region pays for a walk, and a reader should not be the one waiting
// on it. Asking for a price registers nothing.
//
// A station this cannot resolve is skipped rather than failing the pass: one
// market an account cannot have must not cost it the rest.
func TrackMarketSources(ctx context.Context, request eipnats.MarketSourcesRequest, deps *taskrun.Dependencies) error {
	if deps == nil || deps.Redis == nil {
		return fmt.Errorf("redis client is required")
	}
	if len(request.StationIDs) == 0 {
		return nil
	}

	registered, unknown := 0, 0
	for _, stationID := range request.StationIDs {
		regionID, err := esicore.RegionOfStation(ctx, deps.ESI, deps.Redis, stationID)
		if err != nil {
			logs.WarnCtx(ctx, "skipping a market that does not resolve", "station_id", stationID, "error", err)
			unknown++
			continue
		}
		if err := trackStation(ctx, deps, regionID, stationID); err != nil {
			return err
		}
		registered++
	}

	logs.InfoCtx(ctx, "market sources registered",
		"markets", len(request.StationIDs), "registered", registered, "unresolved", unknown)
	return nil
}

// trackStation records that a station is wanted, and asks for whatever the
// market still needs to be priced: the first station in a region pays for its
// walk, and a later one is derived from the pages that walk already stored.
func trackStation(ctx context.Context, deps *taskrun.Dependencies, regionID int32, stationID int64) error {
	orders := deps.Redis.MarketOrders()

	tracked, err := orders.TrackedStations(ctx, regionID)
	if err != nil {
		return err
	}
	if err := orders.TrackStation(ctx, regionID, stationID, time.Now()); err != nil {
		return err
	}

	for _, station := range tracked {
		if station.StationID == stationID {
			return nil
		}
	}
	if len(tracked) == 0 {
		return eipnats.PublishRefreshRegionMarketOrders(ctx, deps.NATS, regionID)
	}
	return eipnats.PublishDeriveRegionMarketPrices(ctx, deps.NATS, regionID)
}
