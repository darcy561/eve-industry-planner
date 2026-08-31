package tasks

import (
	"context"
	"fmt"
	"math"
	"slices"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	taskscore "eve-industry-planner/shared/tasks"
	esicore "eve-industry-planner/worker/esi"

	"github.com/hibiken/asynq"
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

// RefreshRegionMarketOrders dumps every market order in one region and stores per-type prices
// for that region's trade hub station.
//
// Orders are filtered to the requested station as they stream, so types traded elsewhere in the
// region produce no entry. Returns an error so asynq retries; a failed pass writes nothing.
func RefreshRegionMarketOrders(ctx context.Context, task *asynq.Task, deps *TaskDependencies) error {
	if task == nil {
		return fmt.Errorf("task is nil")
	}
	if deps == nil {
		return fmt.Errorf("task dependencies are nil")
	}

	request, err := UnmarshalTaskPayload[eipnats.RegionMarketOrdersRequest](task)
	if err != nil {
		return err
	}
	if request.RegionID == 0 || request.StationID == 0 {
		return fmt.Errorf("region market orders refresh requires region_id and station_id")
	}

	lockKey := fmt.Sprintf("esi:market_orders:region:%d:refresh_lock", request.RegionID)
	cleanup, shouldContinue := taskscore.AcquireRefreshLock(ctx, deps.Redis, lockKey)
	if !shouldContinue {
		return nil
	}
	defer cleanup()

	statusResult := esicore.CheckServerStatus(ctx, deps.ESIClient, deps.Redis)
	if err := HandleStatusCheckResult(ctx, statusResult, eipnats.TaskNameRegionMarketOrdersRefresh); err != nil {
		return err
	}

	start := time.Now()

	prevETags, err := rediscore.GetRegionMarketOrdersETags(ctx, deps.Redis, request.RegionID)
	if err != nil {
		logs.WarnCtx(ctx, "failed reading region market orders etags", "region_id", request.RegionID, "error", err)
		prevETags = nil
	}

	accumulators := make(map[int32]*typePriceAccumulator)
	onOrder := func(order ESIMarketOrder) error {
		// The region endpoint returns every station in the region; only the hub station counts.
		if order.LocationID != request.StationID {
			return nil
		}
		acc := accumulators[order.TypeID]
		if acc == nil {
			acc = &typePriceAccumulator{}
			accumulators[order.TypeID] = acc
		}
		if order.IsBuyOrder {
			acc.buyPrices = append(acc.buyPrices, order.Price)
		} else {
			acc.sellPrices = append(acc.sellPrices, order.Price)
		}
		return nil
	}

	fetchResult, err := FetchRegionMarketOrders(ctx, deps.ESIClient, deps.Redis, request.RegionID, prevETags, onOrder)
	if err != nil {
		return HandleStreamError(ctx, err, eipnats.TaskNameRegionMarketOrdersRefresh)
	}

	now := time.Now().UnixMilli()

	// Every page 304'd, so the stored entries still describe the current book.
	if fetchResult.AllUnchanged {
		if err := rediscore.SaveRegionMarketOrdersRefreshTime(ctx, deps.Redis, request.RegionID, now); err != nil {
			return err
		}
		logs.InfoCtx(ctx, "region market orders unchanged",
			"region_id", request.RegionID,
			"station_id", request.StationID,
			"pages", fetchResult.TotalPages,
			"duration_ms", time.Since(start).Milliseconds())
		return nil
	}

	if err := rediscore.SaveRegionMarketOrdersETags(ctx, deps.Redis, request.RegionID, fetchResult.ETags); err != nil {
		logs.WarnCtx(ctx, "failed saving region market orders etags", "region_id", request.RegionID, "error", err)
	}
	// A shrunk book leaves stale trailing pages that would otherwise replay on the next 304.
	if fetchResult.TotalPages > 0 {
		if err := rediscore.DeleteRegionMarketOrdersETagsFrom(ctx, deps.Redis, request.RegionID, fetchResult.TotalPages+1); err != nil {
			logs.WarnCtx(ctx, "failed pruning stale region etags", "region_id", request.RegionID, "error", err)
		}
	}

	written := 0
	for typeID, acc := range accumulators {
		entry := buildMarketPriceEntry(acc, now)
		if err := rediscore.SaveMarketPriceEntry(ctx, deps.Redis, typeID, request.RegionID, entry); err != nil {
			return fmt.Errorf("saving market price entry for type %d: %w", typeID, err)
		}
		written++
	}

	if err := rediscore.SaveRegionMarketOrdersRefreshTime(ctx, deps.Redis, request.RegionID, now); err != nil {
		return err
	}

	logs.InfoCtx(ctx, "region market orders refreshed",
		"region_id", request.RegionID,
		"station_id", request.StationID,
		"pages", fetchResult.TotalPages,
		"types_written", written,
		"bytes_read", fetchResult.TotalBytes,
		"duration_ms", time.Since(start).Milliseconds())

	return nil
}

// buildMarketPriceEntry derives the stored prices for one type from its accumulated order prices.
func buildMarketPriceEntry(acc *typePriceAccumulator, unixMillis int64) rediscore.MarketPriceEntry {
	buy := highestPrice(acc.buyPrices)
	sell := lowestPrice(acc.sellPrices)

	return rediscore.MarketPriceEntry{
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
