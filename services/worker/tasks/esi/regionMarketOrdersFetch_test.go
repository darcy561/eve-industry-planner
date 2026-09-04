package tasks_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
	tasks "eve-industry-planner/worker/tasks/esi"

	"github.com/redis/go-redis/v9"
)

// The paged walk is the one with real state: a book spread over pages, an ETag
// per page, and a Redis cache each page replays from when ESI answers 304. What
// has to match is not just the orders delivered but the cache left behind, since
// that is what the next pass depends on.

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

// walk runs one fetch pass and reports what it delivered and cached.
func walk(t *testing.T, origin *ordersOrigin, prevETags map[int]string) (tasks.RegionOrdersFetchResult, []string, map[string]string) {
	t.Helper()
	fake := redisfake.New(t)

	result, delivered := fetchInto(t, fake.Client, origin, prevETags)
	return result, delivered, cachedPages(t, fake.Client)
}

// fetchInto runs a pass against a caller-supplied Redis, so a replay can reuse
// the cache the priming pass left behind.
func fetchInto(t *testing.T, client *redis.Client, origin *ordersOrigin, prevETags map[int]string) (tasks.RegionOrdersFetchResult, []string) {
	t.Helper()

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	api, stop, err := esiclient.New(client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	var delivered []string
	result, err := tasks.FetchRegionMarketOrders(t.Context(), api, client, 10000002, prevETags,
		func(order esiclient.MarketOrder) error {
			delivered = append(delivered, fmt.Sprintf("%d:%v:%d", order.OrderID, order.Price, order.VolumeRemain))
			return nil
		})
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	return result, delivered
}

// cachedPages is the page cache the next pass will replay from.
func cachedPages(t *testing.T, client *redis.Client) map[string]string {
	t.Helper()

	out := map[string]string{}
	var cursor uint64
	for {
		keys, next, err := client.Scan(t.Context(), cursor, "*market_orders*", 500).Result()
		if err != nil {
			t.Fatalf("scan: %v", err)
		}
		for _, key := range keys {
			value, err := client.Get(t.Context(), key).Result()
			if err != nil {
				continue
			}
			var orders []map[string]any
			if err := json.Unmarshal([]byte(value), &orders); err == nil {
				normalised, _ := json.Marshal(orders)
				out[key] = string(normalised)
				continue
			}
			out[key] = value
		}
		if next == 0 {
			return out
		}
		cursor = next
	}
}

func TestRegionMarketOrdersWalksEveryPage(t *testing.T) {
	const pages, perPage = 4, 50
	origin := newOrdersOrigin(t, pages, perPage)

	result, delivered, cache := walk(t, origin, nil)

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
	// Every page is cached unfiltered so the next 304 can replay it.
	if len(cache) != pages {
		t.Errorf("cached %d pages, want %d", len(cache), pages)
	}
}

func TestRegionMarketOrdersReplaysFromCacheWhenPagesAreUnchanged(t *testing.T) {
	const pages = 3
	origin := newOrdersOrigin(t, pages, 20)
	fake := redisfake.New(t)

	// The first pass populates the cache and collects ETags.
	first, fresh := fetchInto(t, fake.Client, origin, nil)
	if first.AllUnchanged {
		t.Fatal("the priming pass should have fetched")
	}

	for page := 1; page <= pages; page++ {
		origin.notModified[page] = true
	}

	second, replayed := fetchInto(t, fake.Client, origin, first.ETags)

	if !second.AllUnchanged {
		t.Error("every page answered 304, so the pass was unchanged")
	}
	if !slices.Equal(fresh, replayed) {
		t.Errorf("the cache replayed %d orders against the %d that were fetched; first divergence at %s",
			len(replayed), len(fresh), firstDifference(fresh, replayed))
	}
	if len(replayed) == 0 {
		t.Error("a 304 pass should still deliver the book from cache")
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
	next, stop, err := esiclient.New(fake.Client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	count := 0
	result, err := tasks.FetchRegionMarketOrders(t.Context(), next, fake.Client, 10000002, nil,
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
