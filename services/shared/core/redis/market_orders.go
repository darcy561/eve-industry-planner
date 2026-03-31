package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	esicore "eve-industry-planner/shared/core/esi"

	"github.com/redis/go-redis/v9"
)

const (
	// refreshTimesKey is the Redis key for the sorted set tracking market orders refresh times
	refreshTimesKey = "esi:market_orders:refresh_times"
	// totalCountCacheKey is the Redis key for caching the total count of market orders items
	totalCountCacheKey = "esi:market_orders:total_count_cache"
	// marketTokenLimitKey is the Redis key for market-order group token limit.
	marketTokenLimitKey = "esi:group:market-order:token_limit"
	// marketTokenUsedKey is the Redis key for market-order group rolling token usage.
	marketTokenUsedKey = "esi:group:market-order:tokens:sum"
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

// parseRefreshTimeMember parses a member string in format "type_id:location_id" and score into MarketOrdersRefreshTime.
// Returns nil if parsing fails.
func parseRefreshTimeMember(member string, score float64) *MarketOrdersRefreshTime {
	var typeID, locationID int64
	if _, err := fmt.Sscanf(member, "%d:%d", &typeID, &locationID); err != nil {
		return nil
	}
	return &MarketOrdersRefreshTime{
		TypeID:      int32(typeID),
		LocationID:  int32(locationID),
		LastUpdated: int64(score),
	}
}

// formatScoreRange converts minScore and maxScore to Redis string format.
// If score is 0, it's treated as infinity (-inf for min, +inf for max).
func formatScoreRange(minScore, maxScore float64) (minStr, maxStr string) {
	if minScore == 0 {
		minStr = "-inf"
	} else {
		minStr = fmt.Sprintf("%.0f", minScore)
	}
	if maxScore == 0 {
		maxStr = "+inf"
	} else {
		maxStr = fmt.Sprintf("%.0f", maxScore)
	}
	return minStr, maxStr
}

// SaveMarketOrdersRefreshTime updates the refresh time tracking sorted set.
// Uses composite key format: "{type_id}:{location_id}" as member, timestamp as score.
func SaveMarketOrdersRefreshTime(ctx context.Context, client *redis.Client, typeID int32, locationID int32, unixMillis int64) error {
	member := fmt.Sprintf("%d:%d", typeID, locationID)
	return client.ZAdd(ctx, refreshTimesKey, redis.Z{
		Score:  float64(unixMillis),
		Member: member,
	}).Err()
}

// CountMarketOrdersRefreshTimesByScoreRange counts items in the refresh times sorted set
// within a score range (timestamp range). Useful for estimating outdated items without fetching all data.
// minScore and maxScore are timestamps in milliseconds. Use 0 for infinity (-inf for min, +inf for max).
func CountMarketOrdersRefreshTimesByScoreRange(ctx context.Context, client *redis.Client, minScore, maxScore float64) (int64, error) {
	minStr, maxStr := formatScoreRange(minScore, maxScore)
	count, err := client.ZCount(ctx, refreshTimesKey, minStr, maxStr).Result()
	return count, err
}

// CountTotalMarketOrdersRefreshTimes counts the total number of items in the refresh times sorted set.
// This is used to calculate batch sizes based on total items that need to be refreshed.
func CountTotalMarketOrdersRefreshTimes(ctx context.Context, client *redis.Client) (int64, error) {
	// ZCard returns the cardinality (total count) of the sorted set
	count, err := client.ZCard(ctx, refreshTimesKey).Result()
	return count, err
}

// GetCachedTotalMarketOrdersCount retrieves the cached total count of market orders items.
// Returns 0 if not found (cache miss is not an error).
func GetCachedTotalMarketOrdersCount(ctx context.Context, client *redis.Client) (int64, error) {
	val, err := client.Get(ctx, totalCountCacheKey).Int64()
	if err == redis.Nil {
		return 0, nil // Cache miss, not an error
	}
	return val, err
}

// CachedTotalMarketOrdersCountExists checks if the cached total count key exists in Redis.
// Returns true if the key exists, false otherwise.
func CachedTotalMarketOrdersCountExists(ctx context.Context, client *redis.Client) (bool, error) {
	exists, err := client.Exists(ctx, totalCountCacheKey).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}

// SetCachedTotalMarketOrdersCount stores the total count of market orders items in cache.
// TTL should be set to match the recalculation interval (e.g., 4 hours).
func SetCachedTotalMarketOrdersCount(ctx context.Context, client *redis.Client, count int64, ttl time.Duration) error {
	return client.Set(ctx, totalCountCacheKey, count, ttl).Err()
}

// GetMarketOrderTokenLimit retrieves current market-order group token limit from Redis.
// Returns -1 when the key does not exist or cannot be parsed.
func GetMarketOrderTokenLimit(ctx context.Context, client *redis.Client) (int64, error) {
	val, err := client.Get(ctx, marketTokenLimitKey).Int64()
	if err == redis.Nil {
		return -1, nil
	}
	if err != nil {
		return -1, err
	}
	return val, nil
}

// GetMarketOrderTokensUsed retrieves current rolling token usage for market-order group.
// Returns 0 on cache miss.
func GetMarketOrderTokensUsed(ctx context.Context, client *redis.Client) (float64, error) {
	val, err := client.Get(ctx, marketTokenUsedKey).Float64()
	if err == redis.Nil {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return val, nil
}

// GetOldestMarketOrdersRefreshTimes retrieves the N oldest market orders that need refreshing.
// Returns entries sorted by last refresh time (oldest first).
func GetOldestMarketOrdersRefreshTimes(ctx context.Context, client *redis.Client, limit int) ([]MarketOrdersRefreshTime, error) {
	// ZRange returns members with scores, ordered by score ascending (oldest first)
	results, err := client.ZRangeWithScores(ctx, refreshTimesKey, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}

	refreshTimes := make([]MarketOrdersRefreshTime, 0, len(results))
	for _, result := range results {
		member, ok := result.Member.(string)
		if !ok {
			continue
		}

		parsed := parseRefreshTimeMember(member, result.Score)
		if parsed != nil {
			refreshTimes = append(refreshTimes, *parsed)
		}
	}

	return refreshTimes, nil
}

// GetMarketOrdersRefreshTimesByScoreRange retrieves items within a score (timestamp) range.
// Useful for fetching only outdated items without fetching everything.
// minScore and maxScore are timestamps in milliseconds. Use 0 for infinity (-inf for min, +inf for max).
func GetMarketOrdersRefreshTimesByScoreRange(ctx context.Context, client *redis.Client, minScore, maxScore float64, limit int) ([]MarketOrdersRefreshTime, error) {
	minStr, maxStr := formatScoreRange(minScore, maxScore)

	// ZRangeByScore returns members with scores between minScore and maxScore, ordered by score ascending
	opt := &redis.ZRangeBy{
		Min:    minStr,
		Max:    maxStr,
		Offset: 0,
		Count:  int64(limit),
	}
	results, err := client.ZRangeByScoreWithScores(ctx, refreshTimesKey, opt).Result()
	if err != nil {
		return nil, err
	}

	refreshTimes := make([]MarketOrdersRefreshTime, 0, len(results))
	for _, result := range results {
		member, ok := result.Member.(string)
		if !ok {
			continue
		}

		parsed := parseRefreshTimeMember(member, result.Score)
		if parsed != nil {
			refreshTimes = append(refreshTimes, *parsed)
		}
	}

	return refreshTimes, nil
}

// GetMarketOrdersRefreshTimesByType retrieves refresh times for a specific type_id.
// Uses ZScan to find members matching the pattern "{type_id}:*"
func GetMarketOrdersRefreshTimesByType(ctx context.Context, client *redis.Client, typeID int32, limit int) ([]MarketOrdersRefreshTime, error) {
	pattern := fmt.Sprintf("%d:*", typeID)

	var refreshTimes []MarketOrdersRefreshTime
	var cursor uint64 = 0

	for {
		var keys []string
		var err error
		keys, cursor, err = client.ZScan(ctx, refreshTimesKey, cursor, pattern, int64(limit)).Result()
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

			score, err := strconv.ParseFloat(scoreStr, 64)
			if err != nil {
				continue
			}

			parsed := parseRefreshTimeMember(member, score)
			if parsed != nil {
				refreshTimes = append(refreshTimes, *parsed)
			}
		}

		if cursor == 0 || len(refreshTimes) >= limit {
			break
		}
	}

	return refreshTimes, nil
}

// GetExistingMarketOrdersTypeIDs checks which typeIDs have at least one entry
// in the market orders refresh-time tracking sorted set.
// If a typeID is "existing", Redis already has refresh history for it.
func GetExistingMarketOrdersTypeIDs(ctx context.Context, client *redis.Client, typeIDs []int32) (map[int32]bool, error) {
	present := make(map[int32]bool, len(typeIDs))

	// Deduplicate type IDs up front.
	uniqueTypeIDs := make([]int32, 0, len(typeIDs))
	seen := make(map[int32]struct{}, len(typeIDs))
	for _, id := range typeIDs {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniqueTypeIDs = append(uniqueTypeIDs, id)
	}

	if len(uniqueTypeIDs) == 0 {
		return present, nil
	}

	// Refresh-time members are stored as "{type_id}:{location_id}" where location_id
	// is the market region id we refresh for (see RefreshMarketPrices request building).
	locationIDs := make([]int32, 0, len(esicore.DefaultMarketLocations))
	for _, loc := range esicore.DefaultMarketLocations {
		locationIDs = append(locationIDs, loc.RegionID)
	}
	if len(locationIDs) == 0 {
		return present, nil
	}

	// Use batched ZMSCORES to avoid doing ZSCAN per typeID (too slow for large lists).
	// We chunk to keep the member list size reasonable.
	const maxMembersPerQuery = 5000

	memberTypeIDs := make([]int32, 0, maxMembersPerQuery)
	members := make([]string, 0, maxMembersPerQuery)

	flush := func() error {
		if len(members) == 0 {
			return nil
		}

		// ZMScore returns 0 for missing members (Redis nil reply -> 0).
		// Since refresh timestamps are unix millis, a score of 0 effectively means "not present".
		scores, err := client.ZMScore(ctx, refreshTimesKey, members...).Result()
		if err != nil {
			return err
		}

		for i, score := range scores {
			if score != 0 {
				present[memberTypeIDs[i]] = true
			}
		}

		// reset buffers
		members = members[:0]
		memberTypeIDs = memberTypeIDs[:0]
		return nil
	}

	for _, typeID := range uniqueTypeIDs {
		for _, locationID := range locationIDs {
			members = append(members, fmt.Sprintf("%d:%d", typeID, locationID))
			memberTypeIDs = append(memberTypeIDs, typeID)

			if len(members) >= maxMembersPerQuery {
				if err := flush(); err != nil {
					return nil, err
				}
			}
		}
	}

	if err := flush(); err != nil {
		return nil, err
	}

	return present, nil
}
