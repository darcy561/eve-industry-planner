package objectstore

import (
	"context"
	"slices"
	"strconv"
	"time"

	"eve-industry-planner/shared/jsoncodec"
)

// MarketPages reads and writes the raw pages of region market order books.
//
// A page is held so a 304 can be replayed without refetching, and so a station
// can be priced from a walk that has already happened. Both readers want the
// page exactly as ESI sent it, so nothing is filtered on the way in.
type MarketPages struct{ backend Backend }

// NewMarketPages wraps a bucket as the page store.
func NewMarketPages(backend Backend) *MarketPages { return &MarketPages{backend: backend} }

// Available reports whether there is a store behind this at all, so a caller
// can degrade rather than fail when object storage is not configured.
func (m *MarketPages) Available() bool { return m != nil && m.backend != nil }

// regionPrefix is every page of one region, and the unit DropRegion removes.
func regionPrefix(regionID int32) string {
	return "region/" + strconv.FormatInt(int64(regionID), 10) + "/"
}

func pageKey(regionID int32, page int) string {
	return regionPrefix(regionID) + "page/" + strconv.Itoa(page)
}

// Put stores one page of a region's order book.
func (m *MarketPages) Put(ctx context.Context, regionID int32, page int, orders any) error {
	encoded, err := jsoncodec.Marshal(orders)
	if err != nil {
		return err
	}
	return m.backend.Put(ctx, pageKey(regionID, page), encoded)
}

// Get reads one page into target. A page that is not held returns
// [ErrNotFound], which a caller treats as a cache miss rather than a failure.
func (m *MarketPages) Get(ctx context.Context, regionID int32, page int, target any) error {
	encoded, err := m.backend.Get(ctx, pageKey(regionID, page))
	if err != nil {
		return err
	}
	return jsoncodec.Unmarshal(encoded, target)
}

// Held reports whether one page of a region is stored, for a caller that wants
// to know a 304 has something behind it without decoding it.
func (m *MarketPages) Held(ctx context.Context, regionID int32, page int) (bool, error) {
	return m.backend.Exists(ctx, pageKey(regionID, page))
}

// PageNumbers reports which pages of a region are held, ascending.
func (m *MarketPages) PageNumbers(ctx context.Context, regionID int32) ([]int, error) {
	keys, err := m.backend.ListKeys(ctx, regionPrefix(regionID)+"page/")
	if err != nil {
		return nil, err
	}

	pages := make([]int, 0, len(keys))
	for _, key := range keys {
		// ListKeys is sorted lexically, so "10" sorts before "2" and the
		// numbers are sorted again below rather than trusted in key order.
		at := key[len(regionPrefix(regionID)+"page/"):]
		page, err := strconv.Atoi(at)
		if err != nil {
			continue
		}
		pages = append(pages, page)
	}
	slices.Sort(pages)
	return pages, nil
}

// DropRegion removes every page of one region, for a region nothing wants any
// more. One call rather than a page at a time, because the count is only known
// by listing.
func (m *MarketPages) DropRegion(ctx context.Context, regionID int32) error {
	return m.backend.DeletePrefix(ctx, regionPrefix(regionID))
}

// DropPagesFrom removes the pages at or above fromPage, so a book that has
// shrunk does not leave pages a later walk would replay as though they were
// still part of it.
func (m *MarketPages) DropPagesFrom(ctx context.Context, regionID int32, fromPage int) error {
	pages, err := m.PageNumbers(ctx, regionID)
	if err != nil {
		return err
	}
	for _, page := range pages {
		if page < fromPage {
			continue
		}
		if err := m.backend.Delete(ctx, pageKey(regionID, page)); err != nil {
			return err
		}
	}
	return nil
}

// DropRegionsOlderThan removes every region whose most recent page was written
// before cutoff, and reports how many regions went.
//
// Object storage has no expiry of its own, so this is what keeps the bucket from
// growing without bound. A region is judged by its newest page, because a walk
// rewrites the whole book and a part-written region must not be dropped mid-walk.
func (m *MarketPages) DropRegionsOlderThan(ctx context.Context, cutoff time.Time) (int, error) {
	regions, err := m.backend.ListChildNames(ctx, "region")
	if err != nil {
		return 0, err
	}

	dropped := 0
	for _, name := range regions {
		regionID, err := strconv.ParseInt(name, 10, 32)
		if err != nil {
			continue
		}

		newest, err := m.newestPageTime(ctx, int32(regionID))
		if err != nil {
			return dropped, err
		}
		if newest.IsZero() || !newest.Before(cutoff) {
			continue
		}
		if err := m.DropRegion(ctx, int32(regionID)); err != nil {
			return dropped, err
		}
		dropped++
	}
	return dropped, nil
}

func (m *MarketPages) newestPageTime(ctx context.Context, regionID int32) (time.Time, error) {
	keys, err := m.backend.ListKeys(ctx, regionPrefix(regionID))
	if err != nil {
		return time.Time{}, err
	}

	var newest time.Time
	for _, key := range keys {
		info, err := m.backend.Stat(ctx, key)
		if err == ErrNotFound {
			continue
		}
		if err != nil {
			return time.Time{}, err
		}
		if info.ModTime.After(newest) {
			newest = info.ModTime
		}
	}
	return newest, nil
}
