package marketsources

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipredis "eve-industry-planner/shared/redis"
)

// StampPricedAt says, for each market this server prices, when it last walked
// the orders that market is priced from.
//
// Read here rather than left to the client, which only learns the moment by
// asking for a price and holds it until the tab closes. A citadel is left at
// zero — its orders are read on the device — as is a market whose region has
// not been walked yet.
//
// Best effort: a Redis that will not answer is not worth failing the list for.
func StampPricedAt(ctx context.Context, redis *eipredis.Redis, markets models.MarketLocations) models.MarketLocations {
	if redis == nil || len(markets) == 0 {
		return markets
	}

	times, err := redis.MarketOrders().RefreshTimes(ctx)
	if err != nil {
		logs.WarnCtx(ctx, "could not read when each region was last walked", "error", err)
		return markets
	}

	walked := make(map[int64]int64, len(times))
	for _, entry := range times {
		walked[entry.RegionID] = entry.LastUpdated.UnixMilli()
	}

	stamped := make(models.MarketLocations, 0, len(markets))
	for _, market := range markets {
		if market.StationID != 0 {
			market.PricedAt = walked[market.RegionID]
		}
		stamped = append(stamped, market)
	}
	return stamped
}
