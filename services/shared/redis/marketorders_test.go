package redis

// The market-orders keyspace: what each key is called and how long it lives.
// Pinned to literals, for the same reason the dataset keys are.

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"
)

// testRegion is The Forge, the region the market-order tests exercise.
const testRegion int32 = 10000002

func TestMarketOrdersRefreshTimeUpdatesInPlace(t *testing.T) {
	// A region refreshing again moves its score rather than adding a member.
	ctx := context.Background()
	fake := redisfake.New(t)
	store := handle(t, fake).MarketOrders()

	first := time.UnixMilli(1_700_000_000_000).UTC()
	second := time.UnixMilli(1_700_000_500_000).UTC()
	for _, at := range []time.Time{first, second} {
		if err := store.PutRefreshTime(ctx, testRegion, at); err != nil {
			t.Fatalf("put: %v", err)
		}
	}

	times, err := store.RefreshTimes(ctx)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(times) != 1 {
		t.Fatalf("got %d entries, want 1", len(times))
	}
	if !times[0].LastUpdated.Equal(second) {
		t.Fatalf("last updated = %v, want %v", times[0].LastUpdated, second)
	}
}

// Pinned to literals: the equivalence tests read the same constants they check,
// so only this can catch a constant itself being wrong.
func TestMarketOrdersKeyLifetimes(t *testing.T) {
	for name, tc := range map[string]struct {
		got  time.Duration
		want time.Duration
	}{
		"region price":         {ttlRegionPrice, 2 * time.Hour},
		"region etags":         {ttlRegionETags, 24 * time.Hour},
		"region refresh times": {ttlRegionRefreshTimes, 0},
	} {
		t.Run(name, func(t *testing.T) {
			if tc.got != tc.want {
				t.Errorf("ttl = %v, want %v", tc.got, tc.want)
			}
		})
	}
}

func TestRegionPriceLifetimeRetiresSoldOutTypesWithoutDroppingLiveOnes(t *testing.T) {
	const sweep = time.Hour

	// A sweep whose pages all 304 rewrites no prices today, so the lifetime has
	// to span more than one sweep.
	const unchangedSweepsToSurvive = 2

	if ttlRegionPrice < sweep*unchangedSweepsToSurvive {
		t.Errorf("ttl %v does not survive %d unchanged sweeps of %v; live prices would lapse",
			ttlRegionPrice, unchangedSweepsToSurvive, sweep)
	}

	if ttlRegionPrice > 6*time.Hour {
		t.Errorf("ttl %v keeps a sold-out type's price too long", ttlRegionPrice)
	}
}

func TestMarketOrdersWritesCarryTheirKeyKindsLifetime(t *testing.T) {
	ctx := context.Background()
	fake := redisfake.New(t)
	store := handle(t, fake).MarketOrders()

	if err := store.PutPrice(ctx, 34, testRegion, MarketPriceEntry{Buy: 1}); err != nil {
		t.Fatalf("put price: %v", err)
	}
	if err := store.PutETags(ctx, testRegion, map[int]string{1: "a"}); err != nil {
		t.Fatalf("put etags: %v", err)
	}
	if err := store.PutRefreshTime(ctx, testRegion, time.UnixMilli(1_700_000_000_000)); err != nil {
		t.Fatalf("put refresh time: %v", err)
	}

	for key, want := range map[string]time.Duration{
		priceKey(34, testRegion):   ttlRegionPrice,
		regionETagsKey(testRegion): ttlRegionETags,
		regionRefreshTimesKey:      0,
	} {
		if got := fake.Server.TTL(key); got != want {
			t.Errorf("key %q: ttl = %v, want %v", key, got, want)
		}
	}
}
