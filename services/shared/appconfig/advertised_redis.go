package appconfig

import (
	"context"
	"errors"
	"os"
	"strings"

	"eve-industry-planner/shared/telemetry"

	"github.com/redis/go-redis/v9"
)

var (
	// ErrNoRedis means Set was called without a Redis client.
	ErrNoRedis = errors.New("appconfig: redis client is nil")
	// ErrEmptyVersion means Set was called with a blank version string.
	ErrEmptyVersion = errors.New("appconfig: advertised version is empty")
)

const (
	AdvertisedVersionKeyDefault     = "eip:app:advertised_version:v1"
	AdvertisedVersionChannelDefault = "eip:app:advertised_version:v1:notify"
)

// AdvertisedVersionKey is the Redis SoT for the train version browsers should treat as current.
// Empty Redis value → fall back to process bake.
func AdvertisedVersionKey() string {
	return AdvertisedVersionKeyDefault
}

// AdvertisedVersionChannel is PUBLISH'd when sync/ops SET the advertised version (WS fan-out nudge).
func AdvertisedVersionChannel() string {
	return AdvertisedVersionChannelDefault
}

// ProcessAppVersion is this container's baked identity (GH Action / Dockerfile ldflags + ENV).
// Priority: link-time BakedRelease → FRONTEND_APP_VERSION → APP_VERSION_NUMBER → APP_VERSION.
func ProcessAppVersion() string {
	if v := strings.TrimSpace(telemetry.BakedRelease); v != "" {
		return v
	}
	appVersion := strings.TrimSpace(os.Getenv("FRONTEND_APP_VERSION"))
	if appVersion == "" {
		appVersion = strings.TrimSpace(os.Getenv("APP_VERSION_NUMBER"))
	}
	if appVersion == "" {
		appVersion = strings.TrimSpace(os.Getenv("APP_VERSION"))
	}
	if appVersion == "" {
		return "development"
	}
	return appVersion
}

// AdvertisedAppVersion resolves app_version_number when Redis is unavailable.
// Prefer ResolveAdvertisedAppVersion when a Redis client is present.
func AdvertisedAppVersion() string {
	return ProcessAppVersion()
}

// ResolveAdvertisedAppVersion prefers the Redis train SoT, then process bake/env.
func ResolveAdvertisedAppVersion(ctx context.Context, rdb *redis.Client) string {
	if rdb != nil {
		v, err := rdb.Get(ctx, AdvertisedVersionKey()).Result()
		if err == nil {
			if trimmed := strings.TrimSpace(v); trimmed != "" {
				return trimmed
			}
		}
	}
	return ProcessAppVersion()
}

// SetAdvertisedAppVersion writes the train SoT and PUBLISHes on AdvertisedVersionChannel.
func SetAdvertisedAppVersion(ctx context.Context, rdb *redis.Client, version string) error {
	if rdb == nil {
		return ErrNoRedis
	}
	version = strings.TrimSpace(version)
	if version == "" {
		return ErrEmptyVersion
	}
	if err := rdb.Set(ctx, AdvertisedVersionKey(), version, 0).Err(); err != nil {
		return err
	}
	return rdb.Publish(ctx, AdvertisedVersionChannel(), version).Err()
}
