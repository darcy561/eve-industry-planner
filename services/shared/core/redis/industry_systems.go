package redis

import (
	"context"
	"net/url"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// SaveIndustrySystemIndex stores one industry system index JSON under a namespaced key.
func SaveIndustrySystemIndex(ctx context.Context, client *redis.Client, solarSystemID int32, value any) error {
	key := "esi:industry_systems:" + url.PathEscape(strconv.FormatInt(int64(solarSystemID), 10))
	return SaveJSON(ctx, client, key, value, 0)
}

// GetIndustrySystemIndex retrieves one industry system index JSON from a namespaced key.
func GetIndustrySystemIndex(ctx context.Context, client *redis.Client, solarSystemID int32, target any) error {
	key := "esi:industry_systems:" + url.PathEscape(strconv.FormatInt(int64(solarSystemID), 10))
	return GetJSON(ctx, client, key, target)
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
