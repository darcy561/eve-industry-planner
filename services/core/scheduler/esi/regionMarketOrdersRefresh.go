package esi

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"eve-industry-planner/core/scheduler/contract"
	esicore "eve-industry-planner/shared/core/esi"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	redislib "github.com/redis/go-redis/v9"
)

const (
	// estimatedTokensPerRegionRefresh is the market-order token cost of paginating one full
	// region order book, sized above the busiest region's measured cost so a run is only
	// published when the budget can absorb it.
	estimatedTokensPerRegionRefresh = 1000.0
	// tokenReserveRatio keeps a share of the market-order token budget unspent so other ESI
	// work sharing the group is not starved by a refresh cycle.
	tokenReserveRatio = 0.1
)

// ScheduleRegionMarketOrdersRefresh sets up the cron job that refreshes the default market
// regions' order books. Each run publishes one region, cycling through them so their
// paginations never overlap and compete for the shared market-order token budget.
//
// Publishing is skipped while ESI is in downtime, or when the token budget cannot absorb a run.
// Returns a cleanup function and an error if scheduling fails.
func RegionMarketOrdersRefresh(deps contract.Dependencies, jobName string) contract.TaskHandler {
	natsHandle := deps.NATS
	redisClient := deps.Redis

	return func(ctx context.Context, data json.RawMessage) error {
		return runRegionMarketOrdersRefresh(ctx, natsHandle, redisClient)
	}
}

func runRegionMarketOrdersRefresh(
	ctx context.Context,
	natsHandle *eipnats.NATS,
	redisClient *redislib.Client,
) error {
	now := time.Now().UTC()

	if inDowntime, downtimeEnd := isInEVEDowntime(now); inDowntime {
		logs.InfoCtx(ctx, "skipping region market orders refresh during EVE downtime",
			"component", schedulerLogComponent,
			"downtime_end_utc", downtimeEnd.Format(time.RFC3339))
		return nil
	}

	regions := esicore.DefaultMarketLocations
	if len(regions) == 0 {
		return nil
	}

	if !canAffordRegionRefresh(ctx, redisClient) {
		logs.WarnCtx(ctx, "skipping region market orders refresh: market-order token budget exhausted",
			"component", schedulerLogComponent)
		return nil
	}

	index, err := rediscore.NextRegionCronIndex(ctx, redisClient, len(regions))
	if err != nil {
		return err
	}
	location := regions[index]

	if err := eipnats.PublishRefreshRegionMarketOrders(ctx, natsHandle, location.RegionID, location.StationID); err != nil {
		return err
	}

	logs.InfoCtx(ctx, "published region market orders refresh task",
		"component", schedulerLogComponent,
		"region_id", location.RegionID,
		"station_id", location.StationID,
		"region_index", index,
		"regions_total", len(regions))

	return nil
}

// canAffordRegionRefresh reports whether the current market-order token budget can absorb one
// region pagination. An unset or unreadable limit means no cap is applied.
func canAffordRegionRefresh(ctx context.Context, redisClient *redislib.Client) bool {
	tokenLimit, err := rediscore.GetMarketOrderTokenLimit(ctx, redisClient)
	if err != nil {
		logs.WarnCtx(ctx, "failed to read market-order token limit, skipping token-aware cap",
			"component", schedulerLogComponent, "error", err)
		return true
	}
	if tokenLimit <= 0 {
		return true
	}

	tokensUsed, err := rediscore.GetMarketOrderTokensUsed(ctx, redisClient)
	if err != nil {
		logs.WarnCtx(ctx, "failed to read market-order tokens used, skipping token-aware cap",
			"component", schedulerLogComponent, "error", err)
		return true
	}

	available := math.Max(float64(tokenLimit)-tokensUsed, 0)
	effective := math.Max(available-float64(tokenLimit)*tokenReserveRatio, 0)
	if effective >= estimatedTokensPerRegionRefresh {
		return true
	}

	logs.DebugCtx(ctx, "region market orders refresh deferred by token availability",
		"component", schedulerLogComponent,
		"effective_tokens", effective,
		"estimated_tokens_per_refresh", estimatedTokensPerRegionRefresh,
		"market_order_token_limit", tokenLimit,
		"market_order_tokens_used", tokensUsed,
		"token_reserve_ratio", tokenReserveRatio)

	return false
}
