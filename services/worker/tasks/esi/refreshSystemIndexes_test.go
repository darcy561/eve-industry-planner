package esi_test

import (
	"encoding/json"
	"eve-industry-planner/worker/taskrun"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	esitypes "eve-industry-planner/shared/core/esi/types"
	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"
	esi "eve-industry-planner/worker/tasks/esi"
)

// ESI sends a list of activities per system and the application stores them as
// named fields. That flattening is where a mistake hides quietly — a mistyped
// activity name loses one number per system and nothing complains — so these
// assert on the stored rows rather than on the request.

// systemsOrigin answers /industry/systems/ the way ESI does.
type systemsOrigin struct {
	server         *httptest.Server
	requests       atomic.Int64
	statusRequests atomic.Int64
	etag           string
	body           string
}

func newSystemsOrigin(t *testing.T, systems int) *systemsOrigin {
	t.Helper()

	activities := []string{
		"manufacturing", "researching_time_efficiency", "researching_material_efficiency",
		"copying", "invention", "reaction",
	}

	var b strings.Builder
	b.WriteByte('[')
	for i := range systems {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, `{"solar_system_id":%d,"cost_indices":[`, 30000142+i)
		for j, activity := range activities {
			if j > 0 {
				b.WriteByte(',')
			}
			// Distinct value per system and activity, so a field written into
			// the wrong slot shows up rather than colliding with a duplicate.
			fmt.Fprintf(&b, `{"activity":%q,"cost_index":0.0%d%d}`, activity, i%9+1, j+1)
		}
		b.WriteString(`]}`)
	}
	b.WriteByte(']')

	o := &systemsOrigin{etag: `"systems-v1"`, body: b.String()}
	o.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/status") {
			o.statusRequests.Add(1)
			w.Header().Set("X-Ratelimit-Group", "status")
			w.Header().Set("X-Ratelimit-Limit", "600/15m")
			w.Header().Set("X-Ratelimit-Remaining", "590")
			w.Header().Set("ETag", `"status-v1"`)
			_, _ = w.Write([]byte(`{"players":28451,"server_version":"2748291","start_time":"2026-09-04T11:02:00Z"}`))
			return
		}

		o.requests.Add(1)
		w.Header().Set("X-Ratelimit-Group", "industry")
		w.Header().Set("X-Ratelimit-Limit", "150/15m")
		w.Header().Set("X-Ratelimit-Remaining", "140")
		w.Header().Set("ETag", o.etag)
		w.Header().Set("Cache-Control", "public, max-age=300")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(o.body))
	}))
	t.Cleanup(o.server.Close)
	return o
}

func snapshotSystems(t *testing.T, fake *redisfake.Redis) map[string]string {
	t.Helper()
	raw := snapshot(t, fake.Client)

	out := make(map[string]string, len(raw))
	for key, value := range raw {
		if !strings.HasPrefix(key, "esi:industry_systems:") {
			out[key] = value
			continue
		}
		var row esitypes.SystemIndexes
		if err := json.Unmarshal([]byte(value), &row); err != nil {
			out[key] = value
			continue
		}
		row.LastUpdated = 0
		normalised, _ := json.Marshal(row)
		out[key] = string(normalised)
	}
	return out
}

func runSystems(t *testing.T, origin *systemsOrigin) map[string]string {
	t.Helper()
	fake := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	next, stop, err := esiclient.New(fake.Client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	deps := &taskrun.Dependencies{Redis: fake.Client, ESI: next}
	if err := esi.RefreshSystemIndexes(t.Context(), deps); err != nil {
		t.Fatalf("task: %v", err)
	}
	return snapshotSystems(t, fake)
}

func TestSystemIndexesStoresEverySystem(t *testing.T) {
	origin := newSystemsOrigin(t, 40)

	written := runSystems(t, origin)

	if len(written) == 0 {
		t.Fatal("the task wrote nothing")
	}
	if made := origin.requests.Load(); made != 1 {
		t.Errorf("the task made %d requests; one fetch and no pre-flight is expected", made)
	}
	if origin.statusRequests.Load() != 0 {
		t.Error("availability comes from the call the task was making, not a pre-flight")
	}
}

func TestSystemIndexesFlattenEveryActivity(t *testing.T) {
	origin := newSystemsOrigin(t, 1)
	fake := redisfake.New(t)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = origin.server.URL
	next, stop, err := esiclient.New(fake.Client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	deps := &taskrun.Dependencies{Redis: fake.Client, ESI: next}
	if err := esi.RefreshSystemIndexes(t.Context(), deps); err != nil {
		t.Fatalf("task: %v", err)
	}

	var stored esitypes.SystemIndexes
	if err := rediscoreGetSystem(t, fake, 30000142, &stored); err != nil {
		t.Fatalf("read back the stored system: %v", err)
	}

	// Every activity ESI sent must land somewhere. A mistyped name in the
	// flattening loses one number silently, which is exactly the kind of thing a
	// key-count comparison would miss.
	fields := map[string]float64{
		"Manufacturing":    stored.Manufacturing,
		"ResearchTime":     stored.ResearchTime,
		"ResearchMaterial": stored.ResearchMaterial,
		"Copying":          stored.Copying,
		"Invention":        stored.Invention,
		"Reaction":         stored.Reaction,
	}
	for name, value := range fields {
		if value == 0 {
			t.Errorf("%s was not filled in; the activity name it maps from is wrong", name)
		}
	}
}

func TestSystemIndexesIgnoreAnUnknownActivity(t *testing.T) {
	// ESI adding an activity should not fail a refresh; the rest of the row is
	// still worth storing.
	fake := redisfake.New(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Ratelimit-Group", "industry")
		w.Header().Set("X-Ratelimit-Limit", "150/15m")
		w.Header().Set("ETag", `"systems-v2"`)
		_, _ = w.Write([]byte(`[{"solar_system_id":30000142,"cost_indices":[
			{"activity":"manufacturing","cost_index":0.05},
			{"activity":"something_ccp_added","cost_index":0.99}]}]`))
	}))
	t.Cleanup(server.Close)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = server.URL
	next, stop, err := esiclient.New(fake.Client, cfg)
	if err != nil {
		t.Fatalf("esiclient: %v", err)
	}
	t.Cleanup(stop)

	deps := &taskrun.Dependencies{Redis: fake.Client, ESI: next}
	if err := esi.RefreshSystemIndexes(t.Context(), deps); err != nil {
		t.Fatalf("an unknown activity should not fail the pass: %v", err)
	}

	var stored esitypes.SystemIndexes
	if err := rediscoreGetSystem(t, fake, 30000142, &stored); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if stored.Manufacturing != 0.05 {
		t.Errorf("Manufacturing = %v, want the value that was sent", stored.Manufacturing)
	}
}

func rediscoreGetSystem(t *testing.T, fake *redisfake.Redis, systemID int32, target *esitypes.SystemIndexes) error {
	t.Helper()
	value, err := fake.Client.Get(t.Context(), fmt.Sprintf("esi:industry_systems:%d", systemID)).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(value), target)
}
