package esi_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"eve-industry-planner/worker/taskrun"

	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared/esiclient"
	eipredis "eve-industry-planner/shared/redis"
	"eve-industry-planner/testing/redisfake"
	esi "eve-industry-planner/worker/tasks/esi"
)

type militiaOrigin struct {
	server     *httptest.Server
	requests   atomic.Int64
	etag       string
	body       string
	notChanged bool
}

func newMilitiaOrigin(t *testing.T, held map[int32]int32) *militiaOrigin {
	t.Helper()

	var b strings.Builder
	b.WriteByte('[')
	first := true
	for systemID, factionID := range held {
		if !first {
			b.WriteByte(',')
		}
		first = false
		fmt.Fprintf(&b, `{"solar_system_id":%d,"owner_faction_id":%d,"occupier_faction_id":%d,"victory_points":1200,"contested":"uncontested"}`,
			systemID, factionID, factionID)
	}
	b.WriteByte(']')

	o := &militiaOrigin{etag: `"militia-v1"`, body: b.String()}
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/status") {
			w.Header().Set("X-Ratelimit-Group", "status")
			w.Header().Set("X-Ratelimit-Limit", "600/15m")
			w.Header().Set("X-Ratelimit-Remaining", "590")
			_, _ = w.Write([]byte(`{"players":1,"server_version":"1","start_time":"2026-09-04T11:02:00Z"}`))
			return
		}

		o.requests.Add(1)
		w.Header().Set("X-Ratelimit-Group", "fw")
		w.Header().Set("X-Ratelimit-Limit", "150/15m")
		w.Header().Set("X-Ratelimit-Remaining", "140")
		w.Header().Set("ETag", o.etag)
		w.Header().Set("Cache-Control", "public, max-age=300")
		w.Header().Set("Content-Type", "application/json")

		if o.notChanged && r.Header.Get("If-None-Match") == o.etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		_, _ = w.Write([]byte(o.body))
	}))
	t.Cleanup(o.server.Close)
	return o
}

func militiaDeps(t *testing.T, origin *militiaOrigin, fake *redisfake.Redis) *taskrun.Dependencies {
	t.Helper()

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	next, stop, err := esiclient.New(eipredis.NewRedis(fake.Client), cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	return &taskrun.Dependencies{Redis: eipredis.NewRedis(fake.Client), ESI: next}
}

func heldSystems(t *testing.T, fake *redisfake.Redis) map[int32]int32 {
	t.Helper()

	out := map[int32]int32{}
	for key, value := range snapshot(t, fake.Client) {
		if !strings.HasPrefix(key, "esi:militia_systems:") {
			continue
		}
		var row esitypes.MilitiaSystem
		if err := json.Unmarshal([]byte(value), &row); err != nil {
			continue
		}
		out[row.SolarSystemID] = row.OwnerFactionID
	}
	return out
}

func TestMilitiaSystemsStoresWhoHoldsEachSystem(t *testing.T) {
	want := map[int32]int32{30045352: 500001, 30002813: 500004, 30003068: 500002}
	origin := newMilitiaOrigin(t, want)
	fake := redisfake.New(t)

	if err := esi.RefreshMilitiaSystems(t.Context(), militiaDeps(t, origin, fake)); err != nil {
		t.Fatalf("task: %v", err)
	}

	got := heldSystems(t, fake)
	if len(got) != len(want) {
		t.Fatalf("stored %d systems, want %d: %v", len(got), len(want), got)
	}
	for systemID, factionID := range want {
		if got[systemID] != factionID {
			t.Errorf("system %d is held by %d, want %d", systemID, got[systemID], factionID)
		}
	}
	if made := origin.requests.Load(); made != 1 {
		t.Errorf("the task made %d requests; one fetch is expected", made)
	}
}

func TestMilitiaSystemsSkipTheWriteWhenNothingChanged(t *testing.T) {
	origin := newMilitiaOrigin(t, map[int32]int32{30045352: 500001})
	fake := redisfake.New(t)
	deps := militiaDeps(t, origin, fake)

	if err := esi.RefreshMilitiaSystems(t.Context(), deps); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	first := snapshot(t, fake.Client)

	origin.notChanged = true
	if err := esi.RefreshMilitiaSystems(t.Context(), deps); err != nil {
		t.Fatalf("second pass: %v", err)
	}

	if origin.requests.Load() != 2 {
		t.Fatalf("the task made %d requests; two passes are expected", origin.requests.Load())
	}
	if held := heldSystems(t, fake); held[30045352] != 500001 {
		t.Errorf("a not-modified pass lost what was already held: %v", held)
	}
	if lastUpdated(t, first) != lastUpdated(t, snapshot(t, fake.Client)) {
		t.Error("a not-modified pass restamped the dataset it did not rewrite")
	}
}

func TestMilitiaSystemsStoreNothingForAnEmptyWar(t *testing.T) {
	origin := newMilitiaOrigin(t, map[int32]int32{})
	fake := redisfake.New(t)

	if err := esi.RefreshMilitiaSystems(t.Context(), militiaDeps(t, origin, fake)); err != nil {
		t.Fatalf("task: %v", err)
	}

	if held := heldSystems(t, fake); len(held) != 0 {
		t.Errorf("stored %v for a war holding nothing", held)
	}
}

func lastUpdated(t *testing.T, keys map[string]string) string {
	t.Helper()
	for key, value := range keys {
		if strings.Contains(key, "militia_systems") && strings.Contains(key, "last_updated") {
			return value
		}
	}
	return ""
}
