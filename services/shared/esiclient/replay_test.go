package esiclient_test

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
)

// A recorded exchange: what ESI answered, and with which rate-limit headers.
// Sequences below are the situations the budget model has to survive, written
// as ESI states them rather than as internal calls.
type exchange struct {
	status    int
	limit     string
	remaining string
	retry     string
	etag      string
}

// replay serves a fixed sequence, then repeats the last entry.
type replay struct {
	t         *testing.T
	sequence  []exchange
	fake      *esiFake
	mu        sync.Mutex
	index     int
	served    []exchange
	tokenSpen int
}

func newReplay(t *testing.T, sequence ...exchange) *replay {
	t.Helper()
	r := &replay{t: t, sequence: sequence, fake: newESIFake(t, 12000)}
	r.fake.fake.Handle(http.MethodGet, "/markets/10000002/orders/", r.serve)
	return r
}

func (r *replay) serve(w http.ResponseWriter, _ *http.Request) {
	r.mu.Lock()
	next := r.sequence[min(r.index, len(r.sequence)-1)]
	r.index++
	r.served = append(r.served, next)
	r.tokenSpen += esiclient.TokenCost(orDefault(next.status, http.StatusOK))
	r.mu.Unlock()

	w.Header().Set("X-Ratelimit-Group", "market-order")
	if next.limit != "" {
		w.Header().Set("X-Ratelimit-Limit", next.limit)
	}
	if next.remaining != "" {
		w.Header().Set("X-Ratelimit-Remaining", next.remaining)
	}
	if next.retry != "" {
		w.Header().Set("Retry-After", next.retry)
	}
	if next.etag != "" {
		w.Header().Set("ETag", next.etag)
	}
	w.WriteHeader(orDefault(next.status, http.StatusOK))
	_, _ = w.Write([]byte(`[]`))
}

func (r *replay) requests() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.index
}

func (r *replay) spent() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.tokenSpen
}

func orDefault(v, fallback int) int {
	if v == 0 {
		return fallback
	}
	return v
}

func replayClient(t *testing.T, r *replay, adjust ...func(*esiclient.Config)) *esiclient.Client {
	t.Helper()
	return newClient(t, r.fake, append([]func(*esiclient.Config){func(c *esiclient.Config) {
		c.Mode = esiclient.ModeDirect
		c.Tolerance = map[esiclient.Class]time.Duration{
			esiclient.ClassBackground:    100 * time.Millisecond,
			esiclient.ClassUserRequested: 100 * time.Millisecond,
		}
		c.Endpoints = []esiclient.EndpointPolicy{{
			Pattern:           "/markets/{region_id}/orders/",
			CompatibilityDate: "2025-12-16",
			MinSpacing:        time.Millisecond,
			Conditional:       true,
		}}
	}}, adjust...)...)
}

func TestReplayA429StopsTheFleetUntilRetryAfter(t *testing.T) {
	r := newReplay(t,
		exchange{status: 200, limit: "12000/15m", remaining: "11998", etag: `"v1"`},
		exchange{status: 429, limit: "12000/15m", remaining: "0", retry: "45"},
	)
	client := replayClient(t, r)

	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("first: %v", err)
	}
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("the 429 is a response, not an error: %v", err)
	}

	before := r.requests()
	for range 5 {
		_, err := client.Do(t.Context(), ordersRequest)
		refusal, ok := esiclient.AsRateLimit(err)
		if !ok {
			t.Fatalf("call after the 429 was not refused: %v", err)
		}
		if refusal.Kind != esiclient.KindGated {
			t.Errorf("Kind = %s, want gated", refusal.Kind)
		}
		if wait := refusal.RetryIn(); wait < 30*time.Second {
			t.Errorf("RetryIn = %v, want about the stated 45s", wait)
		}
	}
	if r.requests() != before {
		t.Errorf("%d requests reached ESI while gated; the point is that none do", r.requests()-before)
	}
}

func TestReplayLimitCutMidWindowIsHonoured(t *testing.T) {
	r := newReplay(t,
		exchange{status: 200, limit: "12000/15m", remaining: "11998", etag: `"v1"`},
		// CCP halves the allowance. Nothing is deployed; the next response says so.
		exchange{status: 200, limit: "20/15m", remaining: "4", etag: `"v1"`},
	)
	client := replayClient(t, r)

	for range 2 {
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("Do: %v", err)
		}
	}

	room, err := client.Headroom(t.Context(), ordersRequest.Path, esiclient.Identity{}, esiclient.ClassBackground)
	if err != nil {
		t.Fatalf("Headroom: %v", err)
	}
	if room.Available > 20 {
		t.Errorf("Available = %d against a stated allowance of 20", room.Available)
	}

	// With four tokens left and two per call, the run must stop almost at once.
	allowed := 0
	for range 10 {
		if _, err := client.Do(t.Context(), ordersRequest); err == nil {
			allowed++
		}
	}
	if allowed > 3 {
		t.Errorf("%d calls got through a bucket reporting four tokens left", allowed)
	}
}

func TestReplayLimitRaiseIsTakenUpWithoutADeploy(t *testing.T) {
	r := newReplay(t,
		exchange{status: 200, limit: "20/15m", remaining: "4", etag: `"v1"`},
		exchange{status: 200, limit: "40000/15m", remaining: "39998", etag: `"v1"`},
	)
	client := replayClient(t, r)

	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("first: %v", err)
	}
	if _, err := client.Do(t.Context(), ordersRequest); err != nil {
		t.Fatalf("second: %v", err)
	}

	room, _ := client.Headroom(t.Context(), ordersRequest.Path, esiclient.Identity{}, esiclient.ClassBackground)
	if room.Available < 1000 {
		t.Errorf("Available = %d; a raised allowance should be used, not waited out", room.Available)
	}
}

func TestReplayConditionalPassCostsHalf(t *testing.T) {
	r := newReplay(t,
		exchange{status: 200, limit: "12000/15m", remaining: "11998", etag: `"v1"`},
		exchange{status: 304, limit: "12000/15m", remaining: "11997", etag: `"v1"`},
	)
	client := replayClient(t, r)

	first, err := client.Do(t.Context(), ordersRequest)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if first.Cost != 2 {
		t.Errorf("a 2xx cost %d, want 2", first.Cost)
	}

	second, err := client.Do(t.Context(), ordersRequest)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if !second.NotModified {
		t.Fatalf("second status = %d, want 304", second.Status)
	}
	if second.Cost != 1 {
		t.Errorf("a 304 cost %d, want 1 — the halving is why validators are enforced", second.Cost)
	}
	if r.spent() != 3 {
		t.Errorf("ESI charged %d tokens over a 200 and a 304, want 3", r.spent())
	}
}

func TestReplayUnmeteredRouteStillPaces(t *testing.T) {
	r := newReplay(t,
		// A legacy route: no rate-limit headers at all.
		exchange{status: 200, etag: `"v1"`},
	)
	client := replayClient(t, r)

	for i := range 5 {
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("call %d on an unmetered route: %v", i, err)
		}
	}
	if r.requests() != 5 {
		t.Errorf("%d requests reached ESI, want 5 — an unmetered route has no budget to exhaust", r.requests())
	}
}

func TestReplayErrorStormTripsTheGuardBeforeESIDoes(t *testing.T) {
	r := newReplay(t, exchange{status: 404, limit: "12000/15m", remaining: "11000"})
	client := replayClient(t, r, func(c *esiclient.Config) { c.ErrorLimitStop = 5 })

	got404 := 0
	refused := 0
	for range 20 {
		resp, err := client.Do(t.Context(), ordersRequest)
		switch {
		case err != nil:
			refused++
		case resp.Status == http.StatusNotFound:
			got404++
		}
	}

	if refused == 0 {
		t.Fatal("the fleet error guard never tripped")
	}
	// The legacy limit is 100 non-2xx/3xx a minute across every route; stopping
	// at five means we never find out what 420 feels like.
	if got404 > 8 {
		t.Errorf("%d errors reached ESI against a stop of 5", got404)
	}
}
