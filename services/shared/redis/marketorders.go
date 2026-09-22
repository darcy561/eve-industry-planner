package redis

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
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
	RegionID    int64
	LastUpdated time.Time
}

// TrackedStation is a station whose prices are derived from its region's pages,
// and when something last asked for them.
type TrackedStation struct {
	StationID int64
	LastAsked time.Time
}

const regionRefreshTimesKey = "esi:market_orders:region_refresh_times"

const (
	// A pass writes only the types the book still holds, so expiry is what
	// retires a sold-out type. Bounded both ways — see TestRegionPriceLifetime.
	ttlRegionPrice = 2 * time.Hour

	// Expires with the pages it would ask ESI to confirm.
	ttlRegionETags = 24 * time.Hour

	// A region missing from the refresh-times set reads as never walked and is
	// refreshed at once, so an expiry would re-walk current books. One member
	// per region.
	ttlRegionRefreshTimes = forever

	// A station leaves the tracked set by being swept for going unasked, not by
	// expiring: the set is what a derive pass reads, and a region whose stations
	// expired underneath it would be walked for nobody.
	ttlTrackedStations = forever
)

// priceKey puts the type first, so every location for a type shares a prefix.
//
// The location is a station rather than its region: one region holds every
// station anybody has asked about, so a region id here would collide the moment
// two of them are priced.
func priceKey(typeID int32, locationID int64) string {
	return "esi:market_orders:" + itoa(int64(typeID)) + ":" + itoa(locationID)
}

func regionETagsKey(regionID int64) string {
	return "esi:market_orders:region:" + itoa(regionID) + ":etags"
}

// trackedRegionsKey is every region something is tracked in, so the sweep can
// read what to walk without scanning the keyspace for per-region sets.
const trackedRegionsKey = "esi:market_orders:tracked_regions"

// trackedStationsIndexKey is every tracked station against the region it sits
// in: one hash, so asking "do we price these markets, and where are they" is a
// single round trip whatever the answer, rather than a read per region.
const trackedStationsIndexKey = "esi:market_orders:tracked_station_regions"

func trackedStationsKey(regionID int64) string {
	return "esi:market_orders:region:" + itoa(regionID) + ":stations"
}

// itoa renders an EVE id for a key. Every id the store keys by is an int64, as
// ESI declares them.
func itoa(id int64) string { return strconv.FormatInt(id, 10) }

// MarketOrders returns the surface for the region order books.
func (r *Redis) MarketOrders() *MarketOrdersStore { return &MarketOrdersStore{redis: r} }

// MarketOrdersStore reads and writes cached region order books, the per-type
// prices derived from them, and the bookkeeping that paces refreshes.
type MarketOrdersStore struct{ redis *Redis }

// PutPrice stores the prices for one type at one location.
func (m *MarketOrdersStore) PutPrice(ctx context.Context, typeID int32, locationID int64, value any) error {
	return m.redis.PutJSON(ctx, priceKey(typeID, locationID), value, ttlRegionPrice)
}

// PricesAtLocation reads many types' prices at one location in a single round
// trip. Types with no stored entry, or an entry that will not decode, are absent
// from the result rather than an error — a market holding no order for a type is
// a normal answer, not a failure.
func (m *MarketOrdersStore) PricesAtLocation(ctx context.Context, locationID int64, typeIDs []int32) (map[int32]*MarketPriceEntry, error) {
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
func (m *MarketOrdersStore) PutETags(ctx context.Context, regionID int64, etags map[int]string) error {
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
func (m *MarketOrdersStore) ETags(ctx context.Context, regionID int64) (map[int]string, error) {
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
func (m *MarketOrdersStore) DeleteETagsFrom(ctx context.Context, regionID int64, fromPage int) error {
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

// PutRefreshTime records when a region last refreshed.
func (m *MarketOrdersStore) PutRefreshTime(ctx context.Context, regionID int64, at time.Time) error {
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
		regionID, err := strconv.ParseInt(member.Member, 10, 64)
		if err != nil {
			continue
		}
		times = append(times, RegionRefreshTime{
			RegionID:    regionID,
			LastUpdated: time.UnixMilli(int64(member.Score)).UTC(),
		})
	}
	return times, nil
}

// TrackStation records that one station's prices are wanted, and when they were
// last asked for. A station already tracked has its timestamp moved forward.
//
// Three writes: the region's wanted-station set, the regions the sweep walks,
// and the index a caller asks "do we price this" through.
//
// Tracking is what a walk is for: a region is swept because stations in it are
// tracked, and a derive pass prices exactly these. Nothing is priced ahead of
// being asked for.
func (m *MarketOrdersStore) TrackStation(ctx context.Context, regionID int64, stationID int64, at time.Time) error {
	if err := m.redis.PutScored(ctx, trackedStationsKey(regionID), itoa(stationID),
		float64(at.UnixMilli()), ttlTrackedStations); err != nil {
		return err
	}
	if err := m.redis.PutScored(ctx, trackedRegionsKey, itoa(regionID),
		float64(at.UnixMilli()), ttlTrackedStations); err != nil {
		return err
	}
	// Written last on purpose. The three writes are not one transaction, and
	// this is the one a caller reads to decide a market needs nothing done:
	// written first, a failure after it would leave a market that looks tracked
	// and is never swept.
	return m.redis.PutFields(ctx, trackedStationsIndexKey,
		map[string]any{itoa(stationID): itoa(regionID)}, ttlTrackedStations)
}

// RegionsOfTrackedStations answers, for the stations asked about, which region
// each sits in — and by their absence, which of them this server does not price.
//
// One round trip for the whole question. It is what a caller holding an
// account's saved markets reads to decide whether anything needs registering at
// all, and what a price read resolves a station by.
func (m *MarketOrdersStore) RegionsOfTrackedStations(ctx context.Context, stationIDs []int64) (map[int64]int64, error) {
	if len(stationIDs) == 0 {
		return map[int64]int64{}, nil
	}

	fields := make([]string, 0, len(stationIDs))
	for _, stationID := range stationIDs {
		fields = append(fields, itoa(stationID))
	}

	held, err := m.redis.NamedFields(ctx, trackedStationsIndexKey, fields...)
	if err != nil {
		return nil, err
	}

	regions := make(map[int64]int64, len(held))
	for field, value := range held {
		stationID, err := strconv.ParseInt(field, 10, 64)
		if err != nil {
			continue
		}
		regionID, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			continue
		}
		regions[stationID] = regionID
	}
	return regions, nil
}

// TrackedRegions reports every region a station is tracked in, which is what the
// sweep walks. The four hubs are among them because the sweep tracks them.
func (m *MarketOrdersStore) TrackedRegions(ctx context.Context) ([]int64, error) {
	stored, err := m.redis.Scored(ctx, trackedRegionsKey)
	if err != nil {
		return nil, err
	}

	regions := make([]int64, 0, len(stored))
	for _, member := range stored {
		regionID, err := strconv.ParseInt(member.Member, 10, 64)
		if err != nil {
			continue
		}
		regions = append(regions, regionID)
	}
	return regions, nil
}

// TrackedStations reports the stations wanted in one region, least recently
// asked for first.
func (m *MarketOrdersStore) TrackedStations(ctx context.Context, regionID int64) ([]TrackedStation, error) {
	stored, err := m.redis.Scored(ctx, trackedStationsKey(regionID))
	if err != nil {
		return nil, err
	}

	stations := make([]TrackedStation, 0, len(stored))
	for _, member := range stored {
		stationID, err := strconv.ParseInt(member.Member, 10, 64)
		if err != nil {
			continue
		}
		stations = append(stations, TrackedStation{
			StationID: stationID,
			LastAsked: time.UnixMilli(int64(member.Score)).UTC(),
		})
	}
	return stations, nil
}

// DropStationsAskedBefore removes the stations in one region that nothing has
// asked about since cutoff, and reports how many remain tracked there.
//
// A caller reading zero remaining is what retires the region itself: its pages
// and its place in the sweep are worth nothing once no station wants them.
func (m *MarketOrdersStore) DropStationsAskedBefore(ctx context.Context, regionID int64, cutoff time.Time) (int, error) {
	stations, err := m.TrackedStations(ctx, regionID)
	if err != nil {
		return 0, err
	}

	stale := make([]string, 0, len(stations))
	remaining := 0
	for _, station := range stations {
		if station.LastAsked.Before(cutoff) {
			stale = append(stale, itoa(station.StationID))
			continue
		}
		remaining++
	}

	if len(stale) > 0 {
		if _, err := m.redis.RemoveScored(ctx, trackedStationsKey(regionID), stale...); err != nil {
			return remaining, err
		}
		if err := m.redis.DeleteFields(ctx, trackedStationsIndexKey, stale...); err != nil {
			return remaining, err
		}
	}
	return remaining, nil
}

// StopTrackingRegionIfUnwanted forgets a region — the stations wanted in it and
// its place in the sweep — but only while nothing wants it, and reports whether
// it did.
//
// The emptiness is checked and acted on under WATCH because the two happen at
// different times: a reader asking about a market in this region between a
// caller's count and its delete would otherwise have their registration wiped
// and the walk it just asked for run for nobody. A registration that lands
// mid-call aborts this instead, and the region keeps its place.
func (m *MarketOrdersStore) StopTrackingRegionIfUnwanted(ctx context.Context, regionID int64) (bool, error) {
	c, err := m.redis.client()
	if err != nil {
		return false, err
	}

	stations := trackedStationsKey(regionID)
	stopped := false

	err = c.Watch(ctx, func(tx *redis.Tx) error {
		stopped = false

		wanted, err := tx.ZCard(ctx, stations).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			return err
		}
		if wanted > 0 {
			return nil
		}

		if _, err := tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			pipe.Del(ctx, stations)
			pipe.ZRem(ctx, trackedRegionsKey, itoa(regionID))
			pipe.ZRem(ctx, regionRefreshTimesKey, itoa(regionID))
			return nil
		}); err != nil {
			return err
		}
		stopped = true
		return nil
	}, stations)

	// An aborted transaction is the answer rather than a failure: the region is wanted again.
	if errors.Is(err, redis.TxFailedErr) {
		return false, nil
	}
	return stopped, err
}
