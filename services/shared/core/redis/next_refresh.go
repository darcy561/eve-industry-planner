package redis

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Datasets that carry an ESI-advertised freshness. The name is the middle of
// the Redis key, so it matches the keys the dataset's own values use.
const (
	DatasetMarketPrices    = "market_prices"
	DatasetIndustrySystems = "industry_systems"
)

// RegionMarketOrdersDataset names one region's order book.
func RegionMarketOrdersDataset(regionID int32) string {
	return fmt.Sprintf("market_orders:region:%d", regionID)
}

// SaveNextRefresh records when ESI says a dataset stops being current, taken
// from the max-age of the response that produced it. The TTL outlives the
// moment it names, so a scheduler can still see that it has passed.
func SaveNextRefresh(ctx context.Context, client *redis.Client, dataset string, at time.Time) error {
	key := "esi:" + dataset + ":next_refresh"
	return SetString(ctx, client, key, strconv.FormatInt(at.UnixMilli(), 10), 48*time.Hour)
}

// NextRefresh is when a dataset stops being current. A zero time means nothing
// has recorded one, which a caller should read as "refresh now" rather than as
// an error — the first pass is what establishes it.
func NextRefresh(ctx context.Context, client *redis.Client, dataset string) (time.Time, error) {
	value, err := GetString(ctx, client, "esi:"+dataset+":next_refresh")
	if err == redis.Nil {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	if value == "" {
		return time.Time{}, nil
	}
	millis, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return time.Time{}, fmt.Errorf("next refresh for %s: %w", dataset, err)
	}
	return time.UnixMilli(millis).UTC(), nil
}
