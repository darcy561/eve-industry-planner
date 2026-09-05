package esiclient_test

import (
	"context"
	"maps"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
	"eve-industry-planner/testing/redisfake"

	"github.com/redis/go-redis/v9"
)

// countingHook tallies commands actually sent to Redis, which is the figure the
// old limiter's eleven-round-trips-per-request problem was measured in.
type countingHook struct {
	commands atomic.Int64
	mu       sync.Mutex
	names    map[string]int
}

func newCountingHook() *countingHook {
	return &countingHook{names: map[string]int{}}
}

func (h *countingHook) DialHook(next redis.DialHook) redis.DialHook { return next }

func (h *countingHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		h.record(cmd.Name())
		return next(ctx, cmd)
	}
}

func (h *countingHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		for _, cmd := range cmds {
			h.record(cmd.Name())
		}
		return next(ctx, cmds)
	}
}

func (h *countingHook) record(name string) {
	h.commands.Add(1)
	h.mu.Lock()
	h.names[name]++
	h.mu.Unlock()
}

func (h *countingHook) reset() {
	h.commands.Store(0)
	h.mu.Lock()
	clear(h.names)
	h.mu.Unlock()
}

func (h *countingHook) breakdown() map[string]int {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]int, len(h.names))
	maps.Copy(out, h.names)
	return out
}

func TestRedisWorkPerRequestIsBounded(t *testing.T) {
	fake := newESIFake(t, 12000)
	rdb := redisfake.New(t)
	hook := newCountingHook()
	rdb.Client.AddHook(hook)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = fake.fake.BaseURL()
	cfg.Transport = fake.fake.Client().Transport
	cfg.Mode = esiclient.ModeDirect
	cfg.Endpoints = []esiclient.EndpointPolicy{{
		Pattern:           "/markets/{region_id}/orders/",
		CompatibilityDate: "2025-12-16",
		MinSpacing:        time.Millisecond,
		Conditional:       true,
	}}

	client, stop, err := esiclient.New(rdb.Client, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(stop)

	// Warm past discovery and the group lookup miss.
	for range 2 {
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("warm: %v", err)
		}
	}

	const calls = 20
	hook.reset()
	for range calls {
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("Do: %v", err)
		}
	}

	perRequest := float64(hook.commands.Load()) / calls
	t.Logf("redis commands per request in direct mode: %.1f  %v", perRequest, hook.breakdown())

	// One reserve and one settle, each a single EVAL. The path's group is looked
	// up once and remembered, so a steady stream neither re-reads nor rewrites
	// it. The limiter this replaces issued eleven unpipelined round trips per
	// request.
	if perRequest > 2 {
		t.Errorf("%.1f Redis commands per request, want no more than 2", perRequest)
	}
}

func TestBlockModeAmortisesRedisAcrossSlots(t *testing.T) {
	fake := newESIFake(t, 12000)
	rdb := redisfake.New(t)
	hook := newCountingHook()
	rdb.Client.AddHook(hook)

	cfg := esiclient.DefaultConfig()
	cfg.BaseURL = fake.fake.BaseURL()
	cfg.Transport = fake.fake.Client().Transport
	cfg.Mode = esiclient.ModeBlock
	cfg.BlockSize = 8
	cfg.Tolerance = map[esiclient.Class]time.Duration{esiclient.ClassBackground: 5 * time.Second}
	cfg.Endpoints = []esiclient.EndpointPolicy{{
		Pattern:           "/markets/{region_id}/orders/",
		CompatibilityDate: "2025-12-16",
		MinSpacing:        time.Millisecond,
		Conditional:       true,
	}}

	client, stop, err := esiclient.New(rdb.Client, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(stop)

	for range 2 {
		if _, err := client.Do(t.Context(), ordersRequest); err != nil {
			t.Fatalf("warm: %v", err)
		}
	}

	const calls = 24
	hook.reset()
	var served atomic.Int64
	var wg sync.WaitGroup
	for range calls {
		wg.Go(func() {
			if _, err := client.Do(t.Context(), ordersRequest); err == nil {
				served.Add(1)
			}
		})
	}
	wg.Wait()

	evals := hook.breakdown()["evalsha"] + hook.breakdown()["eval"]
	completed := served.Load()
	if completed == 0 {
		t.Fatal("no call completed")
	}

	// Each completed call settles, which is one EVAL of its own; everything above
	// that is reservation. A block of eight should cover several calls at once.
	reserves := int64(evals) - completed
	t.Logf("%d completed calls: %d evals, so about %d reservations at block size %d",
		completed, evals, reserves, cfg.BlockSize)
	if reserves >= completed {
		t.Errorf("%d reservations for %d calls; blocks are not amortising", reserves, completed)
	}
}
