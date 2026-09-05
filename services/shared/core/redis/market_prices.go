package redis

import (
	"context"
	"net/url"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// SaveMarketPrice stores one market price JSON under a namespaced key.
func SaveMarketPrice(ctx context.Context, client *redis.Client, typeID int32, value any) error {
	key := "esi:market_prices:" + url.PathEscape(strconv.FormatInt(int64(typeID), 10))
	return SaveJSON(ctx, client, key, value, 0)
}

// GetMarketPrice retrieves one market price JSON from a namespaced key.
func GetMarketPrice(ctx context.Context, client *redis.Client, typeID int32, target any) error {
	key := "esi:market_prices:" + url.PathEscape(strconv.FormatInt(int64(typeID), 10))
	return GetJSON(ctx, client, key, target)
}

// SaveMarketPricesETag stores the ETag for market prices.
func SaveMarketPricesETag(ctx context.Context, client *redis.Client, etag string) error {
	if etag == "" {
		return nil
	}
	return SetString(ctx, client, "esi:market_prices:etag", etag, 0)
}

// GetMarketPricesETag retrieves the stored ETag, if present.
func GetMarketPricesETag(ctx context.Context, client *redis.Client) (string, error) {
	return GetString(ctx, client, "esi:market_prices:etag")
}

// SaveMarketPricesLastUpdated stores the last successful refresh timestamp (millis since epoch).
func SaveMarketPricesLastUpdated(ctx context.Context, client *redis.Client, unixMillis int64) error {
	return SetString(ctx, client, "esi:market_prices:last_updated", strconv.FormatInt(unixMillis, 10), 0)
}
