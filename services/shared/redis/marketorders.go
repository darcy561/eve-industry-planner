package redis

import (
	"context"
	"strconv"
	"time"
)

// MarketPriceEntry holds the prices derived from one region's order book for a
// single type. Buy and Sell are the best prices; BuyP95 and SellP05 are the
// outlier-trimmed percentiles.
type MarketPriceEntry struct {
	Buy         float64 `json:"buy"`
	Sell        float64 `json:"sell"`
	BuyP95      float64 `json:"buy_p95"`
	SellP05     float64 `json:"sell_p05"`
	LastUpdated int64   `json:"last_updated"`
}

// RegionRefreshTime is when one region's order book last refreshed.
type RegionRefreshTime struct {
	RegionID    int32
	LastUpdated time.Time
}

const regionRefreshTimesKey = "esi:market_orders:region_refresh_times"

const (
	// A pass writes only the types the book still holds, so expiry is what
	// retires a sold-out type. Bounded both ways — see TestRegionPriceLifetime.
	ttlRegionPrice = 2 * time.Hour

	// Expires with the pages it would ask ESI to confirm.
	ttlRegionETags = 24 * time.Hour

	ttlRegionPage = 24 * time.Hour

	// A region missing from the refresh-times set reads as never walked and is
	// refreshed at once, so an expiry would re-walk current books. One member
	// per region.
	ttlRegionRefreshTimes = forever
)

// priceKey puts the type first, so every location for a type shares a prefix.
func priceKey(typeID, locationID int32) string {
	return "esi:market_orders:" + itoa(typeID) + ":" + itoa(locationID)
}

func regionETagsKey(regionID int32) string {
	return "esi:market_orders:region:" + itoa(regionID) + ":etags"
}

func regionPageKey(regionID int32, page int) string {
	return "esi:market_orders:region:" + itoa(regionID) + ":page:" + strconv.Itoa(page)
}

func itoa(id int32) string { return strconv.FormatInt(int64(id), 10) }

// MarketOrders returns the surface for the region order books.
func (r *Redis) MarketOrders() *MarketOrdersStore { return &MarketOrdersStore{redis: r} }

// MarketOrdersStore reads and writes cached region order books, the per-type
// prices derived from them, and the bookkeeping that paces refreshes.
type MarketOrdersStore struct{ redis *Redis }

// PutPrice stores the prices for one type at one location.
func (m *MarketOrdersStore) PutPrice(ctx context.Context, typeID, locationID int32, value any) error {
	return m.redis.PutJSON(ctx, priceKey(typeID, locationID), value, ttlRegionPrice)
}

// PricesAtLocation reads many types' prices at one location in a single round
// trip. Types with no stored entry, or an entry that will not decode, are absent
// from the result rather than an error — a market holding no order for a type is
// a normal answer, not a failure.
func (m *MarketOrdersStore) PricesAtLocation(ctx context.Context, locationID int32, typeIDs []int32) (map[int32]*MarketPriceEntry, error) {
	keys := make([]string, len(typeIDs))
	for i, typeID := range typeIDs {
		keys[i] = priceKey(typeID, locationID)
	}

	found, err := GetManyJSON[MarketPriceEntry](ctx, m.redis, keys)
	if err != nil {
		return nil, err
	}

	prices := make(map[int32]*MarketPriceEntry, len(found))
	for i, typeID := range typeIDs {
		if entry, ok := found[keys[i]]; ok {
			prices[typeID] = entry
		}
	}
	return prices, nil
}

// PutETags stores the ETag of each page of one region's order book. Pages with
// an empty ETag are not stored.
func (m *MarketOrdersStore) PutETags(ctx context.Context, regionID int32, etags map[int]string) error {
	fields := make(map[string]any, len(etags))
	for page, etag := range etags {
		if etag != "" {
			fields[strconv.Itoa(page)] = etag
		}
	}
	return m.redis.PutFields(ctx, regionETagsKey(regionID), fields, ttlRegionETags)
}

// ETags reads the stored ETag of each page of one region's order book. A region
// with none returns an empty map.
func (m *MarketOrdersStore) ETags(ctx context.Context, regionID int32) (map[int]string, error) {
	stored, err := m.redis.Fields(ctx, regionETagsKey(regionID))
	if err != nil {
		return nil, err
	}

	etags := make(map[int]string, len(stored))
	for field, etag := range stored {
		if page, err := strconv.Atoi(field); err == nil {
			etags[page] = etag
		}
	}
	return etags, nil
}

// DeleteETagsFrom removes the stored ETags for pages at or above fromPage, so a
// book that has shrunk does not replay pages it no longer has.
func (m *MarketOrdersStore) DeleteETagsFrom(ctx context.Context, regionID int32, fromPage int) error {
	key := regionETagsKey(regionID)
	stored, err := m.redis.Fields(ctx, key)
	if err != nil {
		return err
	}

	stale := make([]string, 0, len(stored))
	for field := range stored {
		if page, err := strconv.Atoi(field); err == nil && page >= fromPage {
			stale = append(stale, field)
		}
	}
	return m.redis.DeleteFields(ctx, key, stale...)
}

// PutPage caches one page of a region's order book.
func (m *MarketOrdersStore) PutPage(ctx context.Context, regionID int32, page int, orders any) error {
	return m.redis.PutJSON(ctx, regionPageKey(regionID, page), orders, ttlRegionPage)
}

// Page reads one cached page of a region's order book into target. A page that
// is not cached returns [redis.Nil].
func (m *MarketOrdersStore) Page(ctx context.Context, regionID int32, page int, target any) error {
	return m.redis.GetJSON(ctx, regionPageKey(regionID, page), target)
}

// PutRefreshTime records when a region last refreshed.
func (m *MarketOrdersStore) PutRefreshTime(ctx context.Context, regionID int32, at time.Time) error {
	return m.redis.PutScored(ctx, regionRefreshTimesKey, itoa(regionID),
		float64(at.UnixMilli()), ttlRegionRefreshTimes)
}

// RefreshTimes reports every tracked region's last refresh, oldest first.
func (m *MarketOrdersStore) RefreshTimes(ctx context.Context) ([]RegionRefreshTime, error) {
	stored, err := m.redis.Scored(ctx, regionRefreshTimesKey)
	if err != nil {
		return nil, err
	}

	times := make([]RegionRefreshTime, 0, len(stored))
	for _, member := range stored {
		regionID, err := strconv.ParseInt(member.Member, 10, 32)
		if err != nil {
			continue
		}
		times = append(times, RegionRefreshTime{
			RegionID:    int32(regionID),
			LastUpdated: time.UnixMilli(int64(member.Score)).UTC(),
		})
	}
	return times, nil
}
