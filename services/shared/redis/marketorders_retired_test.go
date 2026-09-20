package redis

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"
)

// The sweep must take every key of the retired shapes and nothing the running
// code writes — and a price keyed at a station looks like a retired one but for
// the range its location falls in.
func TestTheSweepTakesTheRetiredShapesAndNothingElse(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	handle := NewRedis(fake.Client)
	store := handle.MarketOrders()

	retired := []string{
		"esi:market_orders:34:10000002:etags",
		"esi:market_orders:34:10000002:last_updated",
		"esi:market_orders:34:10000002",
		"esi:market_orders:9955:10000043",
	}
	for _, key := range retired {
		if err := handle.PutString(ctx, key, "{}", 0); err != nil {
			t.Fatalf("seed %s: %v", key, err)
		}
	}

	kept := []string{
		"esi:market_orders:34:60003760",
		"esi:market_orders:region:10000002:etags",
		"esi:market_orders:region_refresh_times",
		"esi:market_orders:tracked_station_regions",
	}
	for _, key := range kept {
		if err := handle.PutString(ctx, key, "{}", 0); err != nil {
			t.Fatalf("seed %s: %v", key, err)
		}
	}

	found, err := store.RetiredMarketKeys(ctx, true)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if found != len(retired) {
		t.Errorf("swept %d keys, want %d", found, len(retired))
	}

	for _, key := range retired {
		if held, _ := handle.Exists(ctx, key); held {
			t.Errorf("%s survived the sweep", key)
		}
	}
	for _, key := range kept {
		if held, _ := handle.Exists(ctx, key); !held {
			t.Errorf("%s was swept and should not have been", key)
		}
	}
}

// A key that will age out is this release's, whatever shape it reads like: the
// running code gives every price it writes a lifetime, and the retired shapes
// never had one. That is what makes the sweep safe against a live instance.
func TestAKeyThatWillExpireIsLeftAlone(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	handle := NewRedis(fake.Client)

	const live = "esi:market_orders:34:10000002"
	if err := handle.PutString(ctx, live, "{}", 2*time.Hour); err != nil {
		t.Fatalf("seed: %v", err)
	}

	found, err := handle.MarketOrders().RetiredMarketKeys(ctx, true)
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if found != 0 {
		t.Errorf("swept %d keys, want none: a key with a lifetime is not retired", found)
	}
	if held, _ := handle.Exists(ctx, live); !held {
		t.Error("a key that would have expired on its own was removed")
	}
}

// Reporting without removing is what the release's dry run reads, and it must
// leave every key where it is.
func TestCountingRetiredKeysRemovesNothing(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	handle := NewRedis(fake.Client)

	const retired = "esi:market_orders:34:10000002:etags"
	if err := handle.PutString(ctx, retired, "{}", 0); err != nil {
		t.Fatalf("seed: %v", err)
	}

	found, err := handle.MarketOrders().RetiredMarketKeys(ctx, false)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if found != 1 {
		t.Fatalf("counted %d, want 1", found)
	}
	if held, _ := handle.Exists(ctx, retired); !held {
		t.Error("counting removed a key")
	}
}

// A second run finds nothing, which is what lets a release be re-run.
func TestASecondSweepFindsNothing(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	handle := NewRedis(fake.Client)

	if err := handle.PutString(ctx, "esi:market_orders:34:10000002:etags", "{}", 0); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := handle.MarketOrders().RetiredMarketKeys(ctx, true); err != nil {
		t.Fatalf("first sweep: %v", err)
	}

	found, err := handle.MarketOrders().RetiredMarketKeys(ctx, true)
	if err != nil {
		t.Fatalf("second sweep: %v", err)
	}
	if found != 0 {
		t.Errorf("a second sweep found %d keys, want none", found)
	}
}
