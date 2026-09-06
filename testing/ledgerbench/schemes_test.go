package ledgerbench_test

import (
	"testing"

	"eve-industry-planner/testing/ledgerbench"

	"github.com/redis/go-redis/v9"
)

func client(t testing.TB) *redis.Client {
	t.Helper()
	c := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6399"})
	if err := c.Ping(t.Context()).Err(); err != nil {
		t.Skipf("no throwaway redis on 6399: %v", err)
	}
	if err := c.FlushAll(t.Context()).Err(); err != nil {
		t.Fatalf("flush: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// A faster scheme that reports different spend is not a comparison, it is a
// different system. Both must agree before any timing means anything.
func TestBothSchemesAgreeOnWhatHasBeenSpent(t *testing.T) {
	rdb := client(t)

	for _, scheme := range []ledgerbench.Scheme{ledgerbench.Ledger(), ledgerbench.Slots(), ledgerbench.Hash()} {
		t.Run(scheme.Name(), func(t *testing.T) {
			key := "agree:" + scheme.Name()
			if err := scheme.Reset(t.Context(), rdb, key); err != nil {
				t.Fatalf("reset: %v", err)
			}

			// Charge is what the window held *before* this call, so a run of
			// twenty 2-token charges should report 0, 2, 4, … 38.
			for i := range 20 {
				spent, err := scheme.Charge(t.Context(), rdb, key, "background", "/markets/orders/", 2)
				if err != nil {
					t.Fatalf("charge %d: %v", i, err)
				}
				if want := i * 2; spent != want {
					t.Fatalf("charge %d reported %d spent, want %d", i, spent, want)
				}
			}
		})
	}
}
