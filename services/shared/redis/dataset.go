package redis

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Dataset names a body of ESI data whose freshness this application tracks.
// Every dataset has a next-refresh and a refresh lock; only a [CachedDataset]
// also stores values of its own.
type Dataset string

// CachedDataset is a dataset this application caches whole: its values, the
// ETag of the response they came from, and when it last refreshed.
//
// A region order book is a Dataset but not a CachedDataset — its prices are
// keyed by type rather than by the dataset, and live under [MarketOrdersStore].
type CachedDataset string

const (
	DatasetMarketPrices    CachedDataset = "market_prices"
	DatasetIndustrySystems CachedDataset = "industry_systems"
)

// Dataset lets a cached dataset be used where any dataset is expected.
func (c CachedDataset) Dataset() Dataset { return Dataset(c) }

// How long a dataset's keys live. Both crons rewrite their whole set each pass,
// so expiry is a backstop rather than what retires a value.
const (
	ttlMarketPrice    = 24 * time.Hour
	ttlIndustrySystem = 24 * time.Hour

	// Expires with the values it would ask ESI to confirm.
	ttlETag = 24 * time.Hour

	// Outlives the moment it names, so a late reader still sees it has passed.
	ttlNextRefresh = 48 * time.Hour

	ttlLastUpdated = 24 * time.Hour
)

// RegionMarketOrdersDataset names one region's order book.
func RegionMarketOrdersDataset(regionID int32) Dataset {
	return Dataset(fmt.Sprintf("market_orders:region:%d", regionID))
}

func (d Dataset) nextRefreshKey() string { return "esi:" + string(d) + ":next_refresh" }

func (c CachedDataset) entryKey(id int32) string {
	return "esi:" + string(c) + ":" + strconv.FormatInt(int64(id), 10)
}

// entryTTL is how long one of this dataset's values lives.
func (c CachedDataset) entryTTL() time.Duration {
	if c == DatasetIndustrySystems {
		return ttlIndustrySystem
	}
	return ttlMarketPrice
}

func (c CachedDataset) etagKey() string        { return "esi:" + string(c) + ":etag" }
func (c CachedDataset) lastUpdatedKey() string { return "esi:" + string(c) + ":last_updated" }

// Cache returns the surface for one cached ESI dataset.
func (r *Redis) Cache(c CachedDataset) *DatasetCache { return &DatasetCache{redis: r, dataset: c} }

// DatasetCache reads and writes one dataset's cached values and freshness.
type DatasetCache struct {
	redis   *Redis
	dataset CachedDataset
}

// PutEntry stores one value, keyed by the id it belongs to.
func (o *DatasetCache) PutEntry(ctx context.Context, id int32, value any) error {
	return o.redis.PutJSON(ctx, o.dataset.entryKey(id), value, o.dataset.entryTTL())
}

// Entry reads one value into target. A missing entry returns [redis.Nil].
func (o *DatasetCache) Entry(ctx context.Context, id int32, target any) error {
	return o.redis.GetJSON(ctx, o.dataset.entryKey(id), target)
}

// Entries reads many of this dataset's values in a single round trip. An id with
// no stored entry, or one that will not decode, is absent from the result rather
// than an error.
//
// Generic rather than a method because Go methods take no type parameters, and
// the caller is the only one that knows what its values decode to.
func Entries[T any](ctx context.Context, o *DatasetCache, ids []int32) (map[int32]*T, error) {
	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = o.dataset.entryKey(id)
	}

	found, err := GetManyJSON[T](ctx, o.redis, keys)
	if err != nil {
		return nil, err
	}

	values := make(map[int32]*T, len(found))
	for i, id := range ids {
		if value, ok := found[keys[i]]; ok {
			values[id] = value
		}
	}
	return values, nil
}

// PutETag stores the ETag of the response the values came from. An empty ETag
// is not stored.
func (o *DatasetCache) PutETag(ctx context.Context, etag string) error {
	if etag == "" {
		return nil
	}
	return o.redis.PutString(ctx, o.dataset.etagKey(), etag, ttlETag)
}

// ETag reads the stored ETag. A missing ETag returns [redis.Nil].
func (o *DatasetCache) ETag(ctx context.Context) (string, error) {
	return o.redis.GetString(ctx, o.dataset.etagKey())
}

// PutLastUpdated records a successful refresh.
func (o *DatasetCache) PutLastUpdated(ctx context.Context, at time.Time) error {
	return o.redis.PutString(ctx, o.dataset.lastUpdatedKey(), formatMillis(at), ttlLastUpdated)
}

// PutNextRefresh records when ESI says a dataset stops being current, taken
// from the max-age of the response that produced it.
func (r *Redis) PutNextRefresh(ctx context.Context, d Dataset, at time.Time) error {
	return r.PutString(ctx, d.nextRefreshKey(), formatMillis(at), ttlNextRefresh)
}

// NextRefresh reports when a dataset stops being current. A zero time means
// none has been recorded, which a caller reads as "refresh now".
func (r *Redis) NextRefresh(ctx context.Context, d Dataset) (time.Time, error) {
	return r.readMillis(ctx, d.nextRefreshKey())
}

func (r *Redis) readMillis(ctx context.Context, key string) (time.Time, error) {
	value, err := r.GetString(ctx, key)
	if errors.Is(err, redis.Nil) {
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
		return time.Time{}, fmt.Errorf("redis: %s: %w", key, err)
	}
	return time.UnixMilli(millis).UTC(), nil
}

func formatMillis(at time.Time) string {
	return strconv.FormatInt(at.UnixMilli(), 10)
}
