package tasks_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	esitypes "eve-industry-planner/shared/core/esi/types"
	rediscore "eve-industry-planner/shared/core/redis"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
	tasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

// These run the handler end to end — a real HTTP origin, a real Redis, the real
// task — and assert on what it leaves behind.

const pricesPath = "/markets/prices/"

// priceOrigin answers /markets/prices/ the way ESI does, headers included, and
// counts what it was asked.
type priceOrigin struct {
	server   *httptest.Server
	requests atomic.Int64
	etag     string
	body     string
	notMod   atomic.Bool
}

func newPriceOrigin(t *testing.T, rows int) *priceOrigin {
	t.Helper()

	var b strings.Builder
	b.WriteByte('[')
	for i := range rows {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, `{"type_id":%d,"adjusted_price":%d.5,"average_price":%d.25}`, 34+i, i+1, i+2)
	}
	b.WriteByte(']')

	o := &priceOrigin{etag: `"prices-v1"`, body: b.String()}
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o.requests.Add(1)
		w.Header().Set("X-Ratelimit-Group", "market-order")
		w.Header().Set("X-Ratelimit-Limit", "12000/15m")
		w.Header().Set("X-Ratelimit-Remaining", "11000")
		w.Header().Set("ETag", o.etag)
		w.Header().Set("Cache-Control", "public, max-age=300")

		if o.notMod.Load() && r.Header.Get("If-None-Match") == o.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(o.body))
	}))
	t.Cleanup(o.server.Close)
	return o
}

// snapshot is every key the task wrote, with the volatile parts normalised.
func snapshot(t *testing.T, client *redis.Client) map[string]string {
	t.Helper()
	ctx := t.Context()

	out := map[string]string{}
	var cursor uint64
	for {
		keys, next, err := client.Scan(ctx, cursor, "*", 500).Result()
		if err != nil {
			t.Fatalf("scan: %v", err)
		}
		for _, key := range keys {
			// The limiter's own bookkeeping is not what the task produced.
			if strings.HasPrefix(key, "esi:group:") || strings.HasPrefix(key, "esi:b:") ||
				strings.HasPrefix(key, "esi:errors:") || strings.HasPrefix(key, "esi:path:") ||
				key == "esi:downtime" || strings.HasPrefix(key, "esi:primary_group:") ||
				strings.HasSuffix(key, ":refresh_lock") {
				continue
			}
			value, err := client.Get(ctx, key).Result()
			if err != nil {
				continue
			}
			out[key] = normalise(key, value)
		}
		if next == 0 {
			break
		}
		cursor = next
	}
	return out
}

// normalise strips the parts of a value that are a function of when the run
// happened rather than of what it fetched.
func normalise(key, value string) string {
	// next_refresh is when to come back, not stored data — a 304 carries a fresh
	// max-age and is expected to move it.
	if strings.Contains(key, "last_updated") || strings.Contains(key, "lastUpdated") ||
		strings.HasSuffix(key, ":next_refresh") {
		return "<timestamp>"
	}
	var row esitypes.AdjustedPrice
	if err := json.Unmarshal([]byte(value), &row); err == nil && row.TypeID != 0 {
		row.LastUpdated = 0
		normalised, _ := json.Marshal(row)
		return string(normalised)
	}
	return value
}

// esiFor builds the client the task uses, pointed at a test origin.
func esiFor(t *testing.T, baseURL string, client *redis.Client) esiclient.API {
	t.Helper()
	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = baseURL
	api, stop, err := esiclient.New(client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)
	return api
}

func runPrices(t *testing.T, origin *priceOrigin) (map[string]string, *redis.Client) {
	t.Helper()
	fake := redisfake.New(t)
	deps := &tasks.TaskDependencies{Redis: fake.Client, ESI: esiFor(t, origin.server.URL, fake.Client)}
	if err := tasks.RefreshAdjustedPrices(t.Context(), asynq.NewTask("refreshAdjustedPrices", nil), deps); err != nil {
		t.Fatalf("task: %v", err)
	}
	return snapshot(t, fake.Client), fake.Client
}

func TestAdjustedPricesStoresEveryRow(t *testing.T) {
	origin := newPriceOrigin(t, 250)

	written, client := runPrices(t, origin)
	if len(written) == 0 {
		t.Fatal("the task wrote nothing")
	}

	// Only the adjusted price is kept; ESI's average price is not stored.
	var row esitypes.AdjustedPrice
	if err := rediscore.GetMarketPrice(t.Context(), client, 34, &row); err != nil {
		t.Fatalf("reading type 34: %v", err)
	}
	if row.AdjustedPrice != 1.5 {
		t.Errorf("adjusted price = %v, want 1.5", row.AdjustedPrice)
	}
	if row.LastUpdated == 0 {
		t.Error("a stored row should carry when it was fetched")
	}
	if stored := written["esi:market_prices:34"]; strings.Contains(stored, "2.25") {
		t.Errorf("the average price was stored too: %s", stored)
	}

	etag, err := rediscore.GetMarketPricesETag(t.Context(), client)
	if err != nil || etag != origin.etag {
		t.Errorf("stored ETag = %q (err %v), want %q", etag, err, origin.etag)
	}
}

func TestAdjustedPricesMakesNoStatusPreflight(t *testing.T) {
	origin := newPriceOrigin(t, 10)

	runPrices(t, origin)

	// Availability comes from the call the task was making anyway, so the price
	// endpoint is the only thing asked.
	if made := origin.requests.Load(); made != 1 {
		t.Errorf("the task made %d requests; one fetch and no pre-flight is expected", made)
	}
}

func TestAdjustedPricesLeavesStoredRowsAloneOnNotModified(t *testing.T) {
	origin := newPriceOrigin(t, 20)
	fake := redisfake.New(t)
	deps := &tasks.TaskDependencies{Redis: fake.Client, ESI: esiFor(t, origin.server.URL, fake.Client)}
	task := asynq.NewTask("refreshAdjustedPrices", nil)

	if err := tasks.RefreshAdjustedPrices(t.Context(), task, deps); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	first := snapshot(t, fake.Client)

	origin.notMod.Store(true)
	if err := tasks.RefreshAdjustedPrices(t.Context(), task, deps); err != nil {
		t.Fatalf("second pass: %v", err)
	}
	second := snapshot(t, fake.Client)

	if len(first) != len(second) {
		t.Errorf("a 304 changed the stored key count from %d to %d", len(first), len(second))
	}
	for key, want := range first {
		if second[key] != want {
			t.Errorf("%s changed on a 304:\n before: %s\n after:  %s", key, want, second[key])
		}
	}
}

func TestAdjustedPricesHandlesAnEmptyList(t *testing.T) {
	origin := newPriceOrigin(t, 0)

	if _, client := runPrices(t, origin); client == nil {
		t.Fatal("no client")
	}
}

func TestAdjustedPricesRejectsANilTask(t *testing.T) {
	fake := redisfake.New(t)
	deps := &tasks.TaskDependencies{Redis: fake.Client}
	if err := tasks.RefreshAdjustedPrices(t.Context(), nil, deps); err == nil {
		t.Error("a nil task should be reported, not dereferenced")
	}
}

func TestAdjustedPricesSkipsWhenTheLockIsHeld(t *testing.T) {
	origin := newPriceOrigin(t, 5)
	fake := redisfake.New(t)

	// A second worker holding the lock means someone else is already doing this.
	if err := fake.Client.Set(t.Context(), "esi:market_prices:refresh_lock", "held", time.Minute).Err(); err != nil {
		t.Fatalf("seeding the lock: %v", err)
	}

	deps := &tasks.TaskDependencies{Redis: fake.Client, ESI: esiFor(t, origin.server.URL, fake.Client)}
	if err := tasks.RefreshAdjustedPrices(t.Context(), asynq.NewTask("refreshAdjustedPrices", nil), deps); err != nil {
		t.Fatalf("a held lock is not an error: %v", err)
	}
	if made := origin.requests.Load(); made != 0 {
		t.Errorf("the task called ESI %d times while another pass held the lock", made)
	}
}

func TestAdjustedPricesReportsAServerThatIsAway(t *testing.T) {
	origin := newPriceOrigin(t, 5)
	origin.server.Close()

	fake := redisfake.New(t)
	deps := &tasks.TaskDependencies{Redis: fake.Client, ESI: esiFor(t, origin.server.URL, fake.Client)}
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	if err := tasks.RefreshAdjustedPrices(ctx, asynq.NewTask("refreshAdjustedPrices", nil), deps); err == nil {
		t.Fatal("a task that could not reach ESI should report it, so asynq retries")
	}
}

func TestAdjustedPricesRecordsWhenToComeBack(t *testing.T) {
	origin := newPriceOrigin(t, 5)
	fake := redisfake.New(t)
	deps := &tasks.TaskDependencies{Redis: fake.Client, ESI: esiFor(t, origin.server.URL, fake.Client)}
	task := asynq.NewTask("refreshAdjustedPrices", nil)

	before := time.Now()
	if err := tasks.RefreshAdjustedPrices(t.Context(), task, deps); err != nil {
		t.Fatalf("task: %v", err)
	}

	// The origin advertises max-age=300, and that is what decides the next run
	// rather than a cron interval chosen here.
	due, err := rediscore.NextRefresh(t.Context(), fake.Client, rediscore.DatasetMarketPrices)
	if err != nil {
		t.Fatalf("reading next refresh: %v", err)
	}
	if due.IsZero() {
		t.Fatal("nothing recorded when to come back, so the scheduler has only the cron cycle")
	}
	if wait := due.Sub(before); wait < 4*time.Minute || wait > 6*time.Minute {
		t.Errorf("next refresh due in %v, want about the advertised 5 minutes", wait)
	}

	// A 304 is ESI restating how long the answer stays good, so it must move.
	origin.notMod.Store(true)
	if err := tasks.RefreshAdjustedPrices(t.Context(), task, deps); err != nil {
		t.Fatalf("second pass: %v", err)
	}
	after, err := rediscore.NextRefresh(t.Context(), fake.Client, rediscore.DatasetMarketPrices)
	if err != nil {
		t.Fatalf("reading next refresh: %v", err)
	}
	if !after.After(due) {
		t.Errorf("a 304 left the next refresh at %s; its max-age should have pushed it past %s", after, due)
	}
}
