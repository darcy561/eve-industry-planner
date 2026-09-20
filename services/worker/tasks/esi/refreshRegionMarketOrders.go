package esi

import (
	"context"
	"eve-industry-planner/worker/taskrun"
	"fmt"
	"math"
	"slices"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
)

// Percentile prices trim outlying quotes from each side of the book. Below
// minOrdersForPercentile the percentile degenerates towards the best price, so the best price
// is reported instead.
const (
	minOrdersForPercentile = 5
	buyPercentile          = 0.95
	sellPercentile         = 0.05
)

// typePriceAccumulator collects the station-filtered order prices for one type.
// Prices are retained rather than running best/worst values because percentiles need the
// whole distribution.
type typePriceAccumulator struct {
	buyPrices  []float64
	sellPrices []float64
}

// RefreshRegionMarketOrders walks every market order in one region and stores its pages, then asks
// for the stations tracked there to be priced from them.
//
// Walking and pricing are two jobs: this one is ESI-bound and knows nothing about which stations
// anybody wants, so a station added to a region already walked costs no call. Returns an error so
// asynq retries; a failed pass writes nothing.
func RefreshRegionMarketOrders(ctx context.Context, request eipnats.RegionMarketOrdersRequest, deps *taskrun.Dependencies) error {
	if deps == nil {
		return fmt.Errorf("task dependencies are nil")
	}

	if request.RegionID == 0 {
		return fmt.Errorf("region market orders refresh requires region_id")
	}

	if deps.MarketPages.Available() && deps.NATS == nil {
		return fmt.Errorf("nats client is required to ask for a region's prices to be derived")
	}

	dataset := eipredis.RegionMarketOrdersDataset(request.RegionID)
	release, held := deps.Redis.AcquireRefresh(ctx, dataset)
	if !held {
		return nil
	}
	defer release()

	start := time.Now()
	orders := deps.Redis.MarketOrders()

	prevETags, err := orders.ETags(ctx, request.RegionID)
	if err != nil {
		logs.WarnCtx(ctx, "failed reading region market orders etags", "region_id", request.RegionID, "error", err)
		prevETags = nil
	}

	// Without a page store there is nothing for a derive pass to read, so this walk prices what it streams.
	var streamed *stationPrices
	onOrder := func(esiclient.MarketOrder) error { return nil }
	if !deps.MarketPages.Available() {
		tracked, err := orders.TrackedStations(ctx, request.RegionID)
		if err != nil {
			return err
		}
		streamed = newStationPrices(stationIDsOf(tracked))
		onOrder = func(order esiclient.MarketOrder) error {
			streamed.add(order)
			return nil
		}
	}

	fetchResult, err := FetchRegionMarketOrders(ctx, deps.ESI, deps.MarketPages, request.RegionID, prevETags, onOrder)
	if err != nil {
		return HandleStreamError(ctx, err, eipnats.TaskNameRegionMarketOrdersRefresh)
	}

	// The first page's max-age speaks for the book: a region's pages expire together.
	recordNextRefresh(ctx, deps.Redis, dataset,
		time.Duration(fetchResult.CacheSeconds)*time.Second)

	now := time.Now()

	if !fetchResult.AllUnchanged {
		if err := orders.PutETags(ctx, request.RegionID, fetchResult.ETags); err != nil {
			logs.WarnCtx(ctx, "failed saving region market orders etags", "region_id", request.RegionID, "error", err)
		}
		// A shrunk book leaves stale trailing pages that would otherwise replay on the next 304.
		if fetchResult.TotalPages > 0 {
			if err := orders.DeleteETagsFrom(ctx, request.RegionID, fetchResult.TotalPages+1); err != nil {
				logs.WarnCtx(ctx, "failed pruning stale region etags", "region_id", request.RegionID, "error", err)
			}
		}
	}

	written := 0
	if streamed != nil {
		written, err = streamed.write(ctx, orders, now)
		if err != nil {
			return err
		}
	}

	if err := orders.PutRefreshTime(ctx, request.RegionID, now); err != nil {
		return err
	}

	// An unchanged pass asks too: rewriting the prices is what renews their expiry.
	if streamed == nil {
		if err := eipnats.PublishDeriveRegionMarketPrices(ctx, deps.NATS, request.RegionID); err != nil {
			return err
		}
	}

	walked := []any{
		"region_id", request.RegionID,
		"unchanged", fetchResult.AllUnchanged,
		"pages", fetchResult.TotalPages,
		"bytes_read", fetchResult.TotalBytes,
		"duration_ms", time.Since(start).Milliseconds(),
	}
	// A walk counts prices only where it wrote them itself; the derive pass counts its own.
	if streamed != nil {
		walked = append(walked, "types_priced_inline", written)
	}
	logs.InfoCtx(ctx, "region market orders walked", walked...)

	return nil
}

// buildMarketPriceEntry derives the stored prices for one type from its accumulated order prices.
func buildMarketPriceEntry(acc *typePriceAccumulator, unixMillis int64) eipredis.MarketPriceEntry {
	buy := highestPrice(acc.buyPrices)
	sell := lowestPrice(acc.sellPrices)

	return eipredis.MarketPriceEntry{
		Buy:         buy,
		Sell:        sell,
		BuyP95:      percentilePrice(acc.buyPrices, buyPercentile, buy),
		SellP05:     percentilePrice(acc.sellPrices, sellPercentile, sell),
		LastUpdated: unixMillis,
	}
}

// percentilePrice returns the nearest-rank percentile of prices, falling back to fallback when
// the sample is too small for the percentile to carry meaning.
func percentilePrice(prices []float64, percentile float64, fallback float64) float64 {
	if len(prices) < minOrdersForPercentile {
		return fallback
	}

	sorted := slices.Clone(prices)
	slices.Sort(sorted)

	// Nearest-rank: ceil(p * N) as a 1-based rank, clamped into the slice.
	rank := int(math.Ceil(percentile*float64(len(sorted)))) - 1
	rank = max(rank, 0)
	rank = min(rank, len(sorted)-1)

	return sorted[rank]
}

// highestPrice and lowestPrice report 0 for an empty book side rather than panicking.
func highestPrice(prices []float64) float64 {
	if len(prices) == 0 {
		return 0
	}
	return slices.Max(prices)
}

func lowestPrice(prices []float64) float64 {
	if len(prices) == 0 {
		return 0
	}
	return slices.Min(prices)
}
