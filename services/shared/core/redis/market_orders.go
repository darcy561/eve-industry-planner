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

// MarketPriceEntry is a helper type for GetMarketPriceEntriesByType
// This matches the structure used in internal/tasks/esi/refreshMarketPrices.go
type MarketPriceEntry struct {
	Buy         float64 `json:"buy"`
	Sell        float64 `json:"sell"`
	LastUpdated int64   `json:"last_updated"`
}

// MarketOrdersRefreshTime represents an entry in the refresh tracking sorted set
type MarketOrdersRefreshTime struct {
	TypeID      int32
	LocationID  int32
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

// SaveMarketOrdersETags stores ETags per page for market orders as a hash (page number -> ETag).
// Key format: esi:market_orders:{type_id}:{location_id}:etags
// Note: station_id is used only for filtering orders, not in the Redis key
func SaveMarketOrdersETags(ctx context.Context, client *redis.Client, typeID int32, locationID int32, etags map[int]string) error {
	if len(etags) == 0 {
		return nil
	}
	key := fmt.Sprintf("esi:market_orders:%s:%s:etags",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))

	// Use Redis hash to store page -> ETag mapping
	hashFields := make(map[string]interface{})
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

// GetMarketOrdersETags retrieves stored ETags per page for market orders.
// Returns a map[page]etag.
func GetMarketOrdersETags(ctx context.Context, client *redis.Client, typeID int32, locationID int32) (map[int]string, error) {
	key := fmt.Sprintf("esi:market_orders:%s:%s:etags",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))

	hashData, err := client.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	if len(hashData) == 0 {
		return make(map[int]string), nil
	}

	etags := make(map[int]string, len(hashData))
	for pageStr, etag := range hashData {
		if page, err := strconv.Atoi(pageStr); err == nil {
			etags[page] = etag
		}
	}

	return etags, nil
}

// SaveMarketOrdersPage stores market orders for a specific page with a TTL.
// Key format: esi:market_orders:{type_id}:{location_id}:page:{page_number}
// TTL is set to expire the cached data after the specified duration.
func SaveMarketOrdersPage(ctx context.Context, client *redis.Client, typeID int32, locationID int32, page int, orders interface{}, ttl time.Duration) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s:page:%d",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)),
		page)
	return SaveJSON(ctx, client, key, orders, ttl)
}

// GetMarketOrdersPage retrieves cached market orders for a specific page.
// Returns error if not found or on error.
func GetMarketOrdersPage(ctx context.Context, client *redis.Client, typeID int32, locationID int32, page int, target interface{}) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s:page:%d",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)),
		page)
	return GetJSON(ctx, client, key, target)
}

// SaveMarketOrdersLastUpdated stores the last successful refresh timestamp (millis since epoch).
func SaveMarketOrdersLastUpdated(ctx context.Context, client *redis.Client, typeID int32, locationID int32, unixMillis int64) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s:last_updated",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))
	return SetString(ctx, client, key, strconv.FormatInt(unixMillis, 10), 0)
}

// SaveMarketOrdersRefreshTime updates the refresh time tracking sorted set.
// Uses composite key format: "{type_id}:{location_id}" as member, timestamp as score.
// Key: esi:market_orders:refresh_times
func SaveMarketOrdersRefreshTime(ctx context.Context, client *redis.Client, typeID int32, locationID int32, unixMillis int64) error {
	member := fmt.Sprintf("%d:%d", typeID, locationID)
	key := "esi:market_orders:refresh_times"
	return client.ZAdd(ctx, key, redis.Z{
		Score:  float64(unixMillis),
		Member: member,
	}).Err()
}

// GetOldestMarketOrdersRefreshTimes retrieves the N oldest market orders that need refreshing.
// Returns entries sorted by last refresh time (oldest first).
func GetOldestMarketOrdersRefreshTimes(ctx context.Context, client *redis.Client, limit int) ([]MarketOrdersRefreshTime, error) {
	key := "esi:market_orders:refresh_times"

	// ZRange returns members with scores, ordered by score ascending (oldest first)
	results, err := client.ZRangeWithScores(ctx, key, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}

	refreshTimes := make([]MarketOrdersRefreshTime, 0, len(results))
	for _, result := range results {
		member, ok := result.Member.(string)
		if !ok {
			continue
		}

		// Parse composite key format: "type_id:location_id"
		var typeID, locationID int64
		if _, err := fmt.Sscanf(member, "%d:%d", &typeID, &locationID); err != nil {
			continue
		}

		refreshTimes = append(refreshTimes, MarketOrdersRefreshTime{
			TypeID:      int32(typeID),
			LocationID:  int32(locationID),
			LastUpdated: int64(result.Score),
		})
	}

	return refreshTimes, nil
}

// GetMarketOrdersRefreshTimesByType retrieves refresh times for a specific type_id.
// Uses ZScan to find members matching the pattern "{type_id}:*"
func GetMarketOrdersRefreshTimesByType(ctx context.Context, client *redis.Client, typeID int32, limit int) ([]MarketOrdersRefreshTime, error) {
	key := "esi:market_orders:refresh_times"
	pattern := fmt.Sprintf("%d:*", typeID)

	var refreshTimes []MarketOrdersRefreshTime
	var cursor uint64 = 0

	for {
		var keys []string
		var err error
		keys, cursor, err = client.ZScan(ctx, key, cursor, pattern, int64(limit)).Result()
		if err != nil {
			return nil, err
		}

		// ZScan returns alternating member and score pairs
		for i := 0; i < len(keys); i += 2 {
			if i+1 >= len(keys) {
				break
			}
			member := keys[i]
			scoreStr := keys[i+1]

			// Parse composite key
			var typeIDParsed, locationID int64
			if _, err := fmt.Sscanf(member, "%d:%d", &typeIDParsed, &locationID); err != nil {
				continue
			}

			score, err := strconv.ParseFloat(scoreStr, 64)
			if err != nil {
				continue
			}

			refreshTimes = append(refreshTimes, MarketOrdersRefreshTime{
				TypeID:      int32(typeIDParsed),
				LocationID:  int32(locationID),
				LastUpdated: int64(score),
			})
		}

		if cursor == 0 || len(refreshTimes) >= limit {
			break
		}
	}

	return refreshTimes, nil
}
