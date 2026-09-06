package ledgerbench_test

import (
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/testing/ledgerbench"

	"github.com/redis/go-redis/v9"
)

// depths span what a market-order bucket actually holds today (~840) through to
// the ceiling a 12,000-token allowance reaches when every call is a conditional
// hit costing one token.
var depths = []int{100, 840, 3000, 6000, 12000}

func fill(t testing.TB, rdb *redis.Client, s ledgerbench.Scheme, key string, calls int) {
	t.Helper()
	if err := s.Prefill(t.Context(), rdb, key, "background", "/markets/orders/", calls); err != nil {
		t.Fatalf("prefill: %v", err)
	}
}

func timeCharges(t testing.TB, rdb *redis.Client, s ledgerbench.Scheme, key string, n int) time.Duration {
	t.Helper()
	start := time.Now()
	for range n {
		if _, err := s.Charge(t.Context(), rdb, key, "background", "/markets/orders/", 1); err != nil {
			t.Fatalf("charge: %v", err)
		}
	}
	return time.Since(start) / time.Duration(n)
}

func TestCompareAtRealisticDepths(t *testing.T) {
	rdb := client(t)
	const sample = 200

	fmt.Printf("\n  %-8s %12s %12s %12s %14s\n", "charges", "ledger", "slots", "hash", "ledger/hash")
	for _, depth := range depths {
		var per [3]time.Duration
		for i, scheme := range []ledgerbench.Scheme{ledgerbench.Ledger(), ledgerbench.Slots(), ledgerbench.Hash()} {
			key := fmt.Sprintf("cmp:%s:%d", scheme.Name(), depth)
			if err := scheme.Reset(t.Context(), rdb, key); err != nil {
				t.Fatalf("reset: %v", err)
			}
			fill(t, rdb, scheme, key, depth)
			per[i] = timeCharges(t, rdb, scheme, key, sample)
		}
		fmt.Printf("  %-8d %12s %12s %12s %13.2fx\n", depth,
			per[0].Round(time.Microsecond), per[1].Round(time.Microsecond),
			per[2].Round(time.Microsecond), float64(per[0])/float64(per[2]))
	}
	fmt.Println()
}

// The hash scheme's read is one field per (slot, class, endpoint) actually used,
// so its cost tracks how varied the traffic is rather than how much there is.
// One endpoint is the flattering case; this is the other one.
func TestHashCostTracksTrafficVariety(t *testing.T) {
	rdb := client(t)
	endpoints := []string{"/markets/orders/", "/industry/systems/", "/markets/prices/",
		"/characters/affiliation/", "/status/"}

	fmt.Printf("\n  %-10s %12s %12s\n", "endpoints", "hash", "ledger")
	for _, spread := range []int{1, 5} {
		hash, ledger := ledgerbench.Hash(), ledgerbench.Ledger()
		key := fmt.Sprintf("variety:%d", spread)
		for _, s := range []ledgerbench.Scheme{hash, ledger} {
			if err := s.Reset(t.Context(), rdb, key); err != nil {
				t.Fatalf("reset: %v", err)
			}
			for _, ep := range endpoints[:spread] {
				if err := s.Prefill(t.Context(), rdb, key, "background", ep, 6000/spread); err != nil {
					t.Fatalf("prefill: %v", err)
				}
			}
		}
		fmt.Printf("  %-10d %12s %12s\n", spread,
			timeCharges(t, rdb, hash, key, 200).Round(time.Microsecond),
			timeCharges(t, rdb, ledger, key, 200).Round(time.Microsecond))
	}
	fmt.Println()
}
