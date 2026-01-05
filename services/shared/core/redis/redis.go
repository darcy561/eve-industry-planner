package redis

import (
	"context"
	"encoding/json"
	"errors"
	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/shared/logs"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

func Connect() (*redis.Client, error) {
	cfg := config.LoadConfig()

	retryCount := 5
	retryDelay := 5 * time.Second

	for i := 0; i < retryCount; i++ {
		client := redis.NewClient(&redis.Options{
			Addr:         cfg.REDIS_URL,
			DialTimeout:  5 * time.Second,
			ReadTimeout:  3 * time.Second,
			WriteTimeout: 3 * time.Second,
			// Connection pool for concurrent operations (server will close idle connections)
			PoolSize: 10, // Max concurrent connections for performance under load
		})

		err := client.Ping(context.Background()).Err()
		if err == nil {
			i++
			message := fmt.Sprintf("Connected to Redis on attempt %d/%d", i, retryCount)
			logs.Debug(message)

			// Start background monitoring for connection health
			go monitorRedisConnection(client)

			return client, nil
		}
		i++
		message := fmt.Sprintf("Failed to connect to Redis. Attempt %d/%d. Error: %v", i, retryCount, err)
		logs.Error(message)
		client.Close()
		time.Sleep(retryDelay)
	}

	message := fmt.Sprintf("Failed to connect to Redis after %d attempts. Exiting...", retryCount)
	logs.Error(message)
	return nil, errors.New(message)
}

// monitorRedisConnection periodically checks Redis connection health and logs reconnections
func monitorRedisConnection(client *redis.Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ctx := context.Background()

	for range ticker.C {
		err := client.Ping(ctx).Err()
		if err != nil {
			logs.Warn("Redis connection health check failed, attempting reconnect", "error", err)
			// The Redis client will automatically reconnect on next operation
			// We just need to wait for it
			time.Sleep(2 * time.Second)
			if err := client.Ping(ctx).Err(); err == nil {
				logs.Info("Redis reconnected successfully")
			}
		}
	}
}

func Cleanup(ctx context.Context, client *redis.Client) {
	if client == nil {
		return
	}
	_ = client.Close()
}

// SaveJSON stores any JSON-serializable value at the provided key.
func SaveJSON(ctx context.Context, client *redis.Client, key string, value any, ttl time.Duration) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return client.Set(ctx, key, b, ttl).Err()
}

// SetString stores a string value at the provided key.
func SetString(ctx context.Context, client *redis.Client, key, value string, ttl time.Duration) error {
	return client.Set(ctx, key, value, ttl).Err()
}

// GetString retrieves a string value from the provided key.
func GetString(ctx context.Context, client *redis.Client, key string) (string, error) {
	return client.Get(ctx, key).Result()
}

// SaveIndustrySystemIndex stores one industry system index JSON under a namespaced key.
func SaveIndustrySystemIndex(ctx context.Context, client *redis.Client, solarSystemID int32, value any) error {
	key := "esi:industry_systems:" + url.PathEscape(strconv.FormatInt(int64(solarSystemID), 10))
	return SaveJSON(ctx, client, key, value, 0)
}

// SaveIndustrySystemsETag stores the ETag for industry systems.
func SaveIndustrySystemsETag(ctx context.Context, client *redis.Client, etag string) error {
	if etag == "" {
		return nil
	}
	return SetString(ctx, client, "esi:industry_systems:etag", etag, 0)
}

// GetIndustrySystemsETag retrieves the stored ETag, if present.
func GetIndustrySystemsETag(ctx context.Context, client *redis.Client) (string, error) {
	return GetString(ctx, client, "esi:industry_systems:etag")
}

// SaveIndustrySystemsLastUpdated stores the last successful refresh timestamp (millis since epoch).
func SaveIndustrySystemsLastUpdated(ctx context.Context, client *redis.Client, unixMillis int64) error {
	return SetString(ctx, client, "esi:industry_systems:last_updated", strconv.FormatInt(unixMillis, 10), 0)
}

// GetIndustrySystemsNextRefresh retrieves the next refresh timestamp (millis since epoch).
// Returns 0 if not found or on error.
func GetIndustrySystemsNextRefresh(ctx context.Context, client *redis.Client) (int64, error) {
	s, err := GetString(ctx, client, "esi:industry_systems:next_refresh")
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(s, 10, 64)
}

// GetJSON retrieves a JSON value from the provided key and unmarshals it into the target.
func GetJSON(ctx context.Context, client *redis.Client, key string, target any) error {
	val, err := client.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(val), target)
}

// GetIndustrySystemIndex retrieves one industry system index JSON from a namespaced key.
func GetIndustrySystemIndex(ctx context.Context, client *redis.Client, solarSystemID int32, target any) error {
	key := "esi:industry_systems:" + url.PathEscape(strconv.FormatInt(int64(solarSystemID), 10))
	return GetJSON(ctx, client, key, target)
}

// SaveMarketPrice stores one market price JSON under a namespaced key.
func SaveMarketPrice(ctx context.Context, client *redis.Client, typeID int32, value any) error {
	key := "esi:market_prices:" + url.PathEscape(strconv.FormatInt(int64(typeID), 10))
	return SaveJSON(ctx, client, key, value, 0)
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

// GetMarketPricesNextRefresh retrieves the next refresh timestamp (millis since epoch).
// Returns 0 if not found or on error.
func GetMarketPricesNextRefresh(ctx context.Context, client *redis.Client) (int64, error) {
	s, err := GetString(ctx, client, "esi:market_prices:next_refresh")
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(s, 10, 64)
}

// GetMarketPrice retrieves one market price JSON from a namespaced key.
func GetMarketPrice(ctx context.Context, client *redis.Client, typeID int32, target any) error {
	key := "esi:market_prices:" + url.PathEscape(strconv.FormatInt(int64(typeID), 10))
	return GetJSON(ctx, client, key, target)
}

// SaveServerStatus stores the server status JSON.
func SaveServerStatus(ctx context.Context, client *redis.Client, value any) error {
	return SaveJSON(ctx, client, "esi:server_status:data", value, 0)
}

// GetServerStatus retrieves the stored server status JSON.
func GetServerStatus(ctx context.Context, client *redis.Client, target any) error {
	return GetJSON(ctx, client, "esi:server_status:data", target)
}

// SaveServerStatusETag stores the ETag for server status.
func SaveServerStatusETag(ctx context.Context, client *redis.Client, etag string) error {
	if etag == "" {
		return nil
	}
	return SetString(ctx, client, "esi:server_status:etag", etag, 0)
}

// GetServerStatusETag retrieves the stored ETag, if present.
func GetServerStatusETag(ctx context.Context, client *redis.Client) (string, error) {
	return GetString(ctx, client, "esi:server_status:etag")
}

// SaveServerStatusLastUpdated stores the last successful refresh timestamp (millis since epoch).
func SaveServerStatusLastUpdated(ctx context.Context, client *redis.Client, unixMillis int64) error {
	return SetString(ctx, client, "esi:server_status:last_updated", strconv.FormatInt(unixMillis, 10), 0)
}

// GetServerStatusLastUpdated retrieves the last updated timestamp (millis since epoch).
// Returns 0 if not found or on error.
func GetServerStatusLastUpdated(ctx context.Context, client *redis.Client) (int64, error) {
	s, err := GetString(ctx, client, "esi:server_status:last_updated")
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(s, 10, 64)
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

// MarketPriceEntry is a helper type for GetMarketPriceEntriesByType
// This matches the structure used in internal/tasks/esi/refreshMarketPrices.go
type MarketPriceEntry struct {
	Buy         float64 `json:"buy"`
	Sell        float64 `json:"sell"`
	LastUpdated int64   `json:"last_updated"`
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

// SaveMarketOrdersLastUpdated stores the last successful refresh timestamp (millis since epoch).
func SaveMarketOrdersLastUpdated(ctx context.Context, client *redis.Client, typeID int32, locationID int32, unixMillis int64) error {
	key := fmt.Sprintf("esi:market_orders:%s:%s:last_updated",
		url.PathEscape(strconv.FormatInt(int64(typeID), 10)),
		url.PathEscape(strconv.FormatInt(int64(locationID), 10)))
	return SetString(ctx, client, key, strconv.FormatInt(unixMillis, 10), 0)
}

// MarketOrdersRefreshTime represents an entry in the refresh tracking sorted set
type MarketOrdersRefreshTime struct {
	TypeID      int32
	LocationID  int32
	LastUpdated int64 // Unix timestamp in milliseconds
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

// AcquireRefreshLock attempts to acquire a distributed lock for refresh operations.
// Returns true if the lock was acquired, a cleanup function to release the lock, and any error.
// The lock has a 300-second TTL to prevent deadlocks if a worker crashes.
// If lock is not acquired, cleanup will be nil.
func AcquireRefreshLock(ctx context.Context, client *redis.Client, lockKey string) (bool, func(), error) {
	lockAcquired, err := client.SetNX(ctx, lockKey, time.Now().UnixMilli(), 300*time.Second).Result()
	if err != nil {
		return false, nil, err
	}
	if !lockAcquired {
		return false, nil, nil
	}

	cleanup := func() {
		_ = client.Del(ctx, lockKey).Err()
	}
	return true, cleanup, nil
}
