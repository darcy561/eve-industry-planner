package redis

import (
	"context"
	"strconv"

	"github.com/redis/go-redis/v9"
)

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

// SaveServerStatusValidUntil stores the wall time (Unix milliseconds) until which
// callers may treat Redis-cached server status as fresh without calling /status/.
func SaveServerStatusValidUntil(ctx context.Context, client *redis.Client, unixMillis int64) error {
	return SetString(ctx, client, "esi:server_status:valid_until", strconv.FormatInt(unixMillis, 10), 0)
}

// GetServerStatusValidUntil returns the Unix millis instant after which a new status
// HTTP check is allowed. Returns 0 if missing or on error.
func GetServerStatusValidUntil(ctx context.Context, client *redis.Client) (int64, error) {
	s, err := GetString(ctx, client, "esi:server_status:valid_until")
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(s, 10, 64)
}
