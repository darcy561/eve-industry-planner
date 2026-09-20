package esi

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/worker/taskrun"
)

// stationPrices accumulates one region's orders into the per-type prices of each
// station being priced, so ten tracked stations cost one pass rather than ten.
type stationPrices struct {
	wanted map[int64]map[int32]*typePriceAccumulator
}

func newStationPrices(stations []int64) *stationPrices {
	wanted := make(map[int64]map[int32]*typePriceAccumulator, len(stations))
	for _, stationID := range stations {
		wanted[stationID] = make(map[int32]*typePriceAccumulator)
	}
	return &stationPrices{wanted: wanted}
}

func (s *stationPrices) add(order esiclient.MarketOrder) {
	types, tracked := s.wanted[order.LocationID]
	if !tracked {
		return
	}

	acc := types[order.TypeID]
	if acc == nil {
		acc = &typePriceAccumulator{}
		types[order.TypeID] = acc
	}
	if order.IsBuyOrder {
		acc.buyPrices = append(acc.buyPrices, order.Price)
	} else {
		acc.sellPrices = append(acc.sellPrices, order.Price)
	}
}

// write stores what was accumulated, and reports how many type entries it wrote.
func (s *stationPrices) write(ctx context.Context, orders *eipredis.MarketOrdersStore, at time.Time) (int, error) {
	written := 0
	for stationID, types := range s.wanted {
		for typeID, acc := range types {
			entry := buildMarketPriceEntry(acc, at.UnixMilli())
			if err := orders.PutPrice(ctx, typeID, stationID, entry); err != nil {
				return written, fmt.Errorf("saving market price entry for type %d at station %d: %w", typeID, stationID, err)
			}
			written++
		}
	}
	return written, nil
}

// DeriveRegionMarketPrices prices every station tracked in one region from the
// pages its last walk stored.
//
// It asks ESI for nothing and spends no token: a station in a region already
// being walked costs a read of stored pages and a filter, which is what makes
// saving a second market in a region somebody else already priced free.
func DeriveRegionMarketPrices(ctx context.Context, request eipnats.RegionMarketPricesRequest, deps *taskrun.Dependencies) error {
	if deps == nil {
		return fmt.Errorf("task dependencies are nil")
	}
	if request.RegionID == 0 {
		return fmt.Errorf("region market prices derive requires region_id")
	}
	if !deps.MarketPages.Available() {
		// The walk prices what it streams where there is no page store, so this is a no-op.
		logs.DebugCtx(ctx, "no page store to derive region market prices from", "region_id", request.RegionID)
		return nil
	}

	start := time.Now()
	orders := deps.Redis.MarketOrders()

	tracked, err := orders.TrackedStations(ctx, request.RegionID)
	if err != nil {
		return err
	}
	if len(tracked) == 0 {
		return nil
	}

	prices := newStationPrices(stationIDsOf(tracked))

	pages, err := deps.MarketPages.PageNumbers(ctx, request.RegionID)
	if err != nil {
		return err
	}
	if len(pages) == 0 {
		// A region tracked but never walked has no pages yet; the next sweep asks again.
		logs.InfoCtx(ctx, "no stored pages to derive region market prices from",
			"region_id", request.RegionID, "stations", len(tracked))
		return nil
	}

	for _, page := range pages {
		var stored []esiclient.MarketOrder
		if err := deps.MarketPages.Get(ctx, request.RegionID, page, &stored); err != nil {
			return fmt.Errorf("reading stored page %d of region %d: %w", page, request.RegionID, err)
		}
		for _, order := range stored {
			prices.add(order)
		}
	}

	written, err := prices.write(ctx, orders, time.Now())
	if err != nil {
		return err
	}

	logs.InfoCtx(ctx, "region market prices derived",
		"region_id", request.RegionID,
		"stations", len(tracked),
		"pages_read", len(pages),
		"types_written", written,
		"duration_ms", time.Since(start).Milliseconds())

	return nil
}

func stationIDsOf(tracked []eipredis.TrackedStation) []int64 {
	ids := make([]int64, 0, len(tracked))
	for _, station := range tracked {
		ids = append(ids, station.StationID)
	}
	return ids
}
