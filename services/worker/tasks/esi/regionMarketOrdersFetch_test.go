package esi_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	objectstore "eve-industry-planner/shared/core/objectstore"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
	esi "eve-industry-planner/worker/tasks/esi"

	"github.com/redis/go-redis/v9"

	eipredis "eve-industry-planner/shared/redis"
)

// The paged walk is the one with real state: a book spread over pages, an ETag
// per page, and a page store each page replays from when ESI answers 304. What
// has to match is not just the orders delivered but the pages left behind, since
// that is what the next pass depends on.
//
// Redis is still here because the ESI client paces itself through it; the pages
// are the only thing that moved to object storage.

type ordersOrigin struct {
	server   *httptest.Server
	requests atomic.Int64
	pages    int
	perPage  int
	// notModified marks pages that answer 304 when the caller sends their ETag.
	notModified map[int]bool
}

func newOrdersOrigin(t *testing.T, pages, perPage int) *ordersOrigin {
	t.Helper()

	o := &ordersOrigin{pages: pages, perPage: perPage, notModified: map[int]bool{}}
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/status") {
			w.Header().Set("X-Ratelimit-Group", "status")
			w.Header().Set("X-Ratelimit-Limit", "600/15m")
			w.Header().Set("ETag", `"status-v1"`)
			_, _ = w.Write([]byte(`{"players":1,"server_version":"1","start_time":"2026-09-04T11:02:00Z"}`))
			return
		}

		o.requests.Add(1)
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			fmt.Sscanf(raw, "%d", &page)
		}
		etag := fmt.Sprintf(`"orders-p%d"`, page)

		w.Header().Set("X-Ratelimit-Group", "market-order")
		w.Header().Set("X-Ratelimit-Limit", "12000/15m")
		w.Header().Set("X-Ratelimit-Remaining", "11000")
		w.Header().Set("X-Pages", fmt.Sprint(o.pages))
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "public, max-age=300")

		if o.notModified[page] && r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(ordersPageBody(page, o.perPage)))
	}))
	t.Cleanup(o.server.Close)
	return o
}

func ordersPageBody(page, perPage int) string {
	var b strings.Builder
	b.WriteByte('[')
	for i := range perPage {
		if i > 0 {
			b.WriteByte(',')
		}
		id := int64(page)*1_000_000 + int64(i)
		fmt.Fprintf(&b, `{"duration":90,"is_buy_order":%t,"issued":"2026-08-14T09:12:31Z",`+
			`"location_id":%d,"min_volume":1,"order_id":%d,"price":%d.5,"range":"region",`+
			`"system_id":30000142,"type_id":%d,"volume_remain":%d,"volume_total":%d}`,
			i%2 == 0, 60003760+int64(i%3), id, i+1, 34+i%7, 100+i, 500+i)
	}
	b.WriteByte(']')
	return b.String()
}

// walk runs one fetch pass and reports what it delivered and stored.
func walk(t *testing.T, origin *ordersOrigin, prevETags map[int]string) (esi.RegionOrdersFetchResult, []string, []int) {
	t.Helper()
	fake := redisfake.New(t)
	pages := objectstore.NewMarketPages(objectstore.NewMemoryBackend())

	result, delivered := fetchInto(t, fake.Client, pages, origin, prevETags)
	return result, delivered, storedPages(t, pages)
}

// fetchInto runs a pass against a caller-supplied Redis and page store, so a
// replay can reuse the pages the priming pass left behind.
func fetchInto(t *testing.T, client *redis.Client, pages *objectstore.MarketPages, origin *ordersOrigin, prevETags map[int]string) (esi.RegionOrdersFetchResult, []string) {
	t.Helper()

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	var delivered []string
	result, err := esi.FetchRegionMarketOrders(t.Context(), api, pages, 10000002, prevETags,
		func(order esiclient.MarketOrder) error {
			delivered = append(delivered, fmt.Sprintf("%d:%v:%d", order.OrderID, order.Price, order.VolumeRemain))
			return nil
		})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	return result, delivered
}

// storedPages is what the next pass will replay from.
func storedPages(t *testing.T, pages *objectstore.MarketPages) []int {
	t.Helper()

	held, err := pages.PageNumbers(t.Context(), 10000002)
	if err != nil {
		t.Fatalf("page numbers: %v", err)
	}
	return held
}

func TestRegionMarketOrdersWalksEveryPage(t *testing.T) {
	const pages, perPage = 4, 50
	origin := newOrdersOrigin(t, pages, perPage)

	result, delivered, stored := walk(t, origin, nil)

	if len(delivered) != pages*perPage {
		t.Errorf("delivered %d orders, want %d", len(delivered), pages*perPage)
	}
	if result.TotalPages != pages {
		t.Errorf("TotalPages = %d, want %d", result.TotalPages, pages)
	}
	if result.AllUnchanged {
		t.Error("a first pass fetched every page, so nothing was unchanged")
	}
	if result.TotalBytes == 0 {
		t.Error("TotalBytes = 0; the wire count is what transfer accounting reads")
	}
	if len(result.ETags) != pages {
		t.Errorf("collected %d ETags, want one per page", len(result.ETags))
	}
	// Every page is stored unfiltered so the next 304 can replay it.
	if want := []int{1, 2, 3, 4}; !slices.Equal(stored, want) {
		t.Errorf("stored pages %v, want %v", stored, want)
	}
}

func TestRegionMarketOrdersReplaysFromStorageWhenPagesAreUnchanged(t *testing.T) {
	const pageCount = 3
	origin := newOrdersOrigin(t, pageCount, 20)
	fake := redisfake.New(t)
	pages := objectstore.NewMarketPages(objectstore.NewMemoryBackend())

	// The first pass stores the pages and collects ETags.
	first, fresh := fetchInto(t, fake.Client, pages, origin, nil)
	if first.AllUnchanged {
		t.Fatal("the priming pass should have fetched")
	}

	for page := 1; page <= pageCount; page++ {
		origin.notModified[page] = true
	}

	second, replayed := fetchInto(t, fake.Client, pages, origin, first.ETags)

	if !second.AllUnchanged {
		t.Error("every page answered 304, so the pass was unchanged")
	}
	if !slices.Equal(fresh, replayed) {
		t.Errorf("the store replayed %d orders against the %d that were fetched; first divergence at %s",
			len(replayed), len(fresh), firstDifference(fresh, replayed))
	}
	if len(replayed) == 0 {
		t.Error("a 304 pass should still deliver the book from storage")
	}
}

func TestRegionMarketOrdersTreatsAMissingPageCountAsOnePage(t *testing.T) {
	fake := redisfake.New(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Ratelimit-Group", "market-order")
		w.Header().Set("X-Ratelimit-Limit", "12000/15m")
		w.Header().Set("ETag", `"orders-single"`)
		// No X-Pages at all.
		_, _ = w.Write([]byte(ordersPageBody(1, 3)))
	}))
	t.Cleanup(server.Close)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = server.URL
	next, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	count := 0
	result, err := esi.FetchRegionMarketOrders(t.Context(), next,
		objectstore.NewMarketPages(objectstore.NewMemoryBackend()), 10000002, nil,
		func(esiclient.MarketOrder) error { count++; return nil })
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if count != 3 {
		t.Errorf("delivered %d orders, want the single page's 3", count)
	}
	if result.TotalPages != 0 {
		t.Errorf("TotalPages = %d; with no X-Pages the first page is the whole book", result.TotalPages)
	}
}

func firstDifference(a, b []string) string {
	for i := range min(len(a), len(b)) {
		if a[i] != b[i] {
			return fmt.Sprintf("index %d: %q against %q", i, a[i], b[i])
		}
	}
	return fmt.Sprintf("index %d (one ran out)", min(len(a), len(b)))
}

// A worker started without object storage still walks the book and still prices
// it; what it loses is the replay, so every page is refetched. Degrading is the
// point — a missing page store must not take the sweep down with it.
func TestAWalkWithNoPageStoreStillDeliversTheBook(t *testing.T) {
	const pages, perPage = 2, 10
	origin := newOrdersOrigin(t, pages, perPage)
	fake := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	var delivered int
	result, err := esi.FetchRegionMarketOrders(t.Context(), api, nil, 10000002, nil,
		func(esiclient.MarketOrder) error { delivered++; return nil })
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if delivered != pages*perPage {
		t.Errorf("delivered %d orders, want %d", delivered, pages*perPage)
	}
	if result.TotalPages != pages {
		t.Errorf("TotalPages = %d, want %d", result.TotalPages, pages)
	}
}

// With nothing stored, a 304 has nothing to replay — so the pass must report
// itself changed rather than unchanged, or the caller skips the price write and
// the book silently lapses.
func TestA304WithNoPageStoreIsNotUnchanged(t *testing.T) {
	origin := newOrdersOrigin(t, 1, 5)
	origin.notModified[1] = true
	fake := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	result, err := esi.FetchRegionMarketOrders(t.Context(), api, nil, 10000002, map[int]string{1: `"orders-p1"`},
		func(esiclient.MarketOrder) error { return nil })
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if result.AllUnchanged {
		t.Error("a 304 that replayed nothing reported the region unchanged")
	}
}

// A walk that wants the book stored rather than delivered still has to know its
// 304s replayed something: a missing page reads as changed, so the next pass
// refetches it instead of the region going on claiming to be current.
func TestA304WithNoOrderConsumerStillChecksThePageIsHeld(t *testing.T) {
	origin := newOrdersOrigin(t, 1, 5)
	fake := redisfake.New(t)
	pages := objectstore.NewMarketPages(objectstore.NewMemoryBackend())

	// A priming pass stores the page the 304 below replays.
	if _, _, err := fetchWith(t, fake.Client, pages, origin, nil, nil); err != nil {
		t.Fatalf("priming pass: %v", err)
	}

	origin.notModified[1] = true
	held, _, err := fetchWith(t, fake.Client, pages, origin, map[int]string{1: `"orders-p1"`}, nil)
	if err != nil {
		t.Fatalf("held pass: %v", err)
	}
	if !held.AllUnchanged {
		t.Error("a 304 whose page is held reported the region changed")
	}

	empty := objectstore.NewMarketPages(objectstore.NewMemoryBackend())
	missing, _, err := fetchWith(t, fake.Client, empty, origin, map[int]string{1: `"orders-p1"`}, nil)
	if err != nil {
		t.Fatalf("missing pass: %v", err)
	}
	if missing.AllUnchanged {
		t.Error("a 304 with no stored page reported the region unchanged")
	}
}

// fetchWith runs one pass with a caller-chosen order consumer, which may be nil.
func fetchWith(
	t *testing.T,
	client *redis.Client,
	pages *objectstore.MarketPages,
	origin *ordersOrigin,
	prevETags map[int]string,
	onOrder func(esiclient.MarketOrder) error,
) (esi.RegionOrdersFetchResult, []int, error) {
	t.Helper()

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(eipredis.NewRedis(client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	result, err := esi.FetchRegionMarketOrders(t.Context(), api, pages, 10000002, prevETags, onOrder)
	return result, storedPages(t, pages), err
}
