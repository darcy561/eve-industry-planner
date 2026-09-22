// Package marketsources decides when an account's saved markets need to be
// registered for pricing. It sits beside the handlers rather than inside one
// because the same question is asked at sign-in and at every settings save.
package marketsources

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	eipredis "eve-industry-planner/shared/redis"
)

// RegisterSavedMarkets asks for the account's saved markets to be priced, and
// only for the ones this server does not price yet.
//
// One hash read answers the whole question — which of these stations are
// tracked, and where — so an account whose markets are all known costs a single
// round trip and publishes nothing. That matters because this runs on every
// sign-in and every settings save, most of which change no market at all.
//
// A market this cannot ask about is left for the next sign-in: the registration
// is worth nothing to the request that triggered it, so nothing about it is
// worth failing.
func Register(ctx context.Context, redis *eipredis.Redis, nats *eipnats.NATS, markets models.MarketLocations) {
	if redis == nil || nats == nil {
		return
	}

	saved := markets.StationIDs()
	if len(saved) == 0 {
		return
	}

	tracked, err := redis.MarketOrders().RegionsOfTrackedStations(ctx, saved)
	if err != nil {
		logs.WarnCtx(ctx, "could not read which markets are tracked", "error", err)
		return
	}

	missing := make([]int64, 0, len(saved))
	for _, stationID := range saved {
		if _, priced := tracked[stationID]; !priced {
			missing = append(missing, stationID)
		}
	}
	if len(missing) == 0 {
		return
	}

	if err := eipnats.PublishTrackMarketSources(ctx, nats, missing); err != nil {
		logs.WarnCtx(ctx, "could not ask for saved markets to be priced", "markets", len(missing), "error", err)
	}
}
