package cli

import (
	"context"
	"encoding/json"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"time"

	rediscore "eve-industry-planner/shared/core/redis"
)

// RunDisplayMarketPriceCount returns the current market prices item count.
// Prefers cached count, with live fallback from the refresh-time set cardinality.
func RunDisplayMarketPriceCount() error {
	ctx := context.Background()
	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Redis)
	if err != nil {
		return fmt.Errorf("failed connecting to redis: %w", err)
	}
	defer lifecycle.RunCleanups(5*time.Second, stopDeps)

	cacheExists, err := rediscore.CachedTotalMarketOrdersCountExists(ctx, clients.Redis)
	if err != nil {
		return fmt.Errorf("failed checking cached market prices count: %w", err)
	}

	cachedCount, err := rediscore.GetCachedTotalMarketOrdersCount(ctx, clients.Redis)
	if err != nil {
		return fmt.Errorf("failed reading cached market prices count: %w", err)
	}

	source := "cache"
	currentCount := cachedCount
	if !cacheExists {
		liveCount, err := rediscore.CountTotalMarketOrdersRefreshTimes(ctx, clients.Redis)
		if err != nil {
			return fmt.Errorf("failed reading live market prices count: %w", err)
		}
		currentCount = liveCount
		source = "live_fallback"
	}

	out := map[string]interface{}{
		"count":        currentCount,
		"source":       source,
		"cache_exists": cacheExists,
		"cached_count": cachedCount,
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("failed formatting market prices count output: %w", err)
	}
	fmt.Println(string(b))
	return nil
}
