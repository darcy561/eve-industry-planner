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
// Read here rather than left to the client. The moment belongs to the region's
// walk, which the client never sees on its own: a price answer carries it, so a
// browser only learns it by asking for a price and only holds it until the tab
// closes — which had a panel telling a reader nothing had ever been priced at a
// market the server had been walking for weeks.
//
// A citadel is left at zero. Its orders are read with a character's token on the
// device that reads them, so this server's clocks say nothing about it.
//
// A market whose region has not been walked is left at zero too, which is the
// honest answer for one that was saved a moment ago: it is registered, and the
// walk has not come round yet.
//
// Best effort. The markets are the answer; when they were last priced is
// something the panel says alongside them, and a Redis that will not answer is
// not worth failing the list for.
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
