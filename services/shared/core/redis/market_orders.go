package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	// regionRefreshTimesKey is the Redis key for the sorted set tracking region market orders refresh times
	regionRefreshTimesKey = "esi:market_orders:region_refresh_times"
	// regionCronCursorKey tracks which region the refresh cron publishes next.
	regionCronCursorKey = "esi:market_orders:region:cron_cursor"
)

// MarketPriceEntry holds the prices derived from one region's order book for a single type.
// Buy and Sell are the best prices; BuyP95 and SellP05 are the outlier-trimmed percentiles.
type MarketPriceEntry struct {
	Buy         float64 `json:"buy"`
	Sell        float64 `json:"sell"`
	BuyP95      float64 `json:"buy_p95"`
	SellP05     float64 `json:"sell_p05"`
	LastUpdated int64   `json:"last_updated"`
}

// RegionMarketOrdersRefreshTime represents an entry in the region refresh tracking sorted set
type RegionMarketOrdersRefreshTime struct {
	RegionID    int32
	LastUpdated int64 // Unix timestamp in milliseconds
}

// SaveMarketPriceEntry stores market price entry JSON under a namespaced key with type_id first for querying.
// Key format: esi:market_orders:{type_id}:{location_id}
// This allows querying all locations for a type_id using pattern: esi:market_orders:{type_id}:*
// Note: station_id is used only for filtering orders, not in the Redis key
func SaveMarketPriceEntry(ctx context.Context, client *redis.Client, typeID int32, locationID int32, value any) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))
	return SaveJSON(ctx, client, key, value, 0)
}

// GetMarketPriceEntry retrieves market price entry JSON from a namespaced key with type_id first.
func GetMarketPriceEntry(ctx context.Context, client *redis.Client, typeID int32, locationID int32, target any) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))
	return GetJSON(ctx, client, key, target)
}

// GetMarketPriceEntriesByType retrieves all market price entries for a type ID for the given location IDs.
// Uses MGet to batch fetch all values in a single operation (most efficient for known keys).
// Returns a map of location_id to MarketPriceEntry.
func GetMarketPriceEntriesByType(ctx context.Context, client *redis.Client, typeID int32, locationIDs []int32) (map[int32]*MarketPriceEntry, error) {
	if len(locationIDs) == 0 {
		return make(map[int32]*MarketPriceEntry), nil
	}

	// Build exact keys for MGet (more efficient than SCAN when we know the keys)
	typeIDStr := url.PathEscape(strconv.FormatInt(int64(typeID), 10))
	keys := make([]string, len(locationIDs))
	for i, locationID := range locationIDs {
		locationIDStr := url.PathEscape(strconv.FormatInt(int64(locationID), 10))
		keys[i] = fmt.Sprintf("esi:market_orders:%s:%s", typeIDStr, locationIDStr)
	}

	// Batch fetch all values using MGet (single operation)
	values, err := client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}

	// Parse results
	result := make(map[int32]*MarketPriceEntry)
	for i, locationID := range locationIDs {
		if values[i] == nil {
			continue // Key doesn't exist
		}

		// Unmarshal JSON value
		var entry MarketPriceEntry
		valueStr, ok := values[i].(string)
		if !ok {
			continue
		}
		if err := json.Unmarshal([]byte(valueStr), &entry); err != nil {
			continue
		}

		result[locationID] = &entry
	}

	return result, nil
}

// SaveRegionMarketOrdersETags stores ETags per page for one region's order book as a hash (page number -> ETag).
// Key format: esi:market_orders:region:{region_id}:etags
func SaveRegionMarketOrdersETags(ctx context.Context, client *redis.Client, regionID int32, etags map[int]string) error {
	if len(etags) == 0 {
		return nil
	}
	key := regionETagsKey(regionID)

	hashFields := make(map[string]any, len(etags))
	for page, etag := range etags {
		if etag != "" {
			hashFields[strconv.Itoa(page)] = etag
		}
	}

	if len(hashFields) == 0 {
		return nil
	}

	return client.HSet(ctx, key, hashFields).Err()
}

// GetRegionMarketOrdersETags retrieves stored ETags per page for one region's order book.
// Returns a map[page]etag.
func GetRegionMarketOrdersETags(ctx context.Context, client *redis.Client, regionID int32) (map[int]string, error) {
	hashData, err := client.HGetAll(ctx, regionETagsKey(regionID)).Result()
	if err != nil {
		return nil, err
	}

	etags := make(map[int]string, len(hashData))
	for pageStr, etag := range hashData {
		if page, err := strconv.Atoi(pageStr); err == nil {
			etags[page] = etag
		}
	}

	return etags, nil
}

// DeleteRegionMarketOrdersETagsFrom removes cached ETags for pages at or above fromPage.
// Used when a region's page count shrinks so stale trailing pages are not replayed.
func DeleteRegionMarketOrdersETagsFrom(ctx context.Context, client *redis.Client, regionID int32, fromPage int) error {
	etags, err := client.HGetAll(ctx, regionETagsKey(regionID)).Result()
	if err != nil {
		return err
	}

	stale := make([]string, 0)
	for pageStr := range etags {
		if page, err := strconv.Atoi(pageStr); err == nil && page >= fromPage {
			stale = append(stale, pageStr)
		}
	}

	if len(stale) == 0 {
		return nil
	}

	return client.HDel(ctx, regionETagsKey(regionID), stale...).Err()
}

// SaveRegionMarketOrdersPage stores one page of a region's order book with a TTL.
// Key format: esi:market_orders:region:{region_id}:page:{page_number}
func SaveRegionMarketOrdersPage(ctx context.Context, client *redis.Client, regionID int32, page int, orders any, ttl time.Duration) error {
	return SaveJSON(ctx, client, regionPageKey(regionID, page), orders, ttl)
}

// GetRegionMarketOrdersPage retrieves one cached page of a region's order book.
// Returns an error if the page is not cached.
func GetRegionMarketOrdersPage(ctx context.Context, client *redis.Client, regionID int32, page int, target any) error {
	return GetJSON(ctx, client, regionPageKey(regionID, page), target)
}

// SaveRegionMarketOrdersRefreshTime records when a region was last refreshed.
// Member is the region id, score is the timestamp in unix millis.
func SaveRegionMarketOrdersRefreshTime(ctx context.Context, client *redis.Client, regionID int32, unixMillis int64) error {
	return client.ZAdd(ctx, regionRefreshTimesKey, redis.Z{
		Score:  float64(unixMillis),
		Member: strconv.FormatInt(int64(regionID), 10),
	}).Err()
}

// GetRegionMarketOrdersRefreshTimes returns every tracked region refresh time, oldest first.
func GetRegionMarketOrdersRefreshTimes(ctx context.Context, client *redis.Client) ([]RegionMarketOrdersRefreshTime, error) {
	results, err := client.ZRangeWithScores(ctx, regionRefreshTimesKey, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	refreshTimes := make([]RegionMarketOrdersRefreshTime, 0, len(results))
	for _, z := range results {
		member, ok := z.Member.(string)
		if !ok {
			continue
		}
		regionID, err := strconv.ParseInt(member, 10, 32)
		if err != nil {
			continue
		}
		refreshTimes = append(refreshTimes, RegionMarketOrdersRefreshTime{
			RegionID:    int32(regionID),
			LastUpdated: int64(z.Score),
		})
	}

	return refreshTimes, nil
}

// regionETagsKey builds the per-region ETag hash key.
func regionETagsKey(regionID int32) string {
	return fmt.Sprintf("esi:market_orders:region:%s:etags",
		url.PathEscape(strconv.FormatInt(int64(regionID), 10)))
}

// regionPageKey builds the per-region cached page key.
func regionPageKey(regionID int32, page int) string {
	return fmt.Sprintf("esi:market_orders:region:%s:page:%d",
		url.PathEscape(strconv.FormatInt(int64(regionID), 10)), page)
}
