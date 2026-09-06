package esiclient_test

import (
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"

	"github.com/redis/go-redis/v9"
)

// benchRedis is a throwaway server, never the stack's: this writes thousands of
// charges into a bucket ledger.
func benchRedis(b *testing.B) *redis.Client {
	b.Helper()
	c := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6399"})
	if err := c.Ping(b.Context()).Err(); err != nil {
		b.Skipf("no throwaway redis on 6399: %v", err)
	}
	if err := c.FlushAll(b.Context()).Err(); err != nil {
		b.Fatalf("flush: %v", err)
	}
	b.Cleanup(func() { _ = c.Close() })
	return c
}

// What one ESI call costs to coordinate, against a real Redis rather than a
// fake: the Lua is where the work happens, and an in-process stand-in measures
// its own interpreter instead.
//
// Skipped unless a throwaway server is running on 6399 — never the stack's,
// since this writes thousands of charges into a bucket ledger:
//
//	docker run -d --rm --name eip-bench-redis -p 6399:6379 redis:8

// fillLedger settles n calls so the ledger carries a realistic number of live
// charges. Ledger size is what the reserve walk covers, so it is the thing
// worth varying.
func fillLedger(b *testing.B, store *esiclient.Store, bucket esiclient.Bucket, n int) {
	b.Helper()
	for range n {
		grant, err := store.Reserve(b.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
		if err != nil || !grant.Granted {
			continue
		}
		_ = store.Settle(b.Context(), grant.Reservations[0], esiclient.Outcome{
			Attempted: true, Status: 200, Cost: 2, ObservedAt: time.Now(),
			Limit: 120000, Window: 15 * time.Minute, Remaining: 120000, Metered: true,
		})
	}
}

func BenchmarkSettle(b *testing.B) {
	for _, size := range []int{100, 1000, 3000} {
		b.Run(fmt.Sprintf("ledger=%d", size), func(b *testing.B) {
			store := esiclient.NewStore(benchRedis(b), esiclient.DefaultConfig())
			bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}
			fillLedger(b, store, bucket, size)

			b.ResetTimer()
			for range b.N {
				grant, err := store.Reserve(b.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
				if err != nil || !grant.Granted {
					b.StopTimer()
					b.Fatalf("reserve: %v %+v", err, grant)
				}
				if err := store.Settle(b.Context(), grant.Reservations[0], esiclient.Outcome{
					Attempted: true, Status: 200, Cost: 2, ObservedAt: time.Now(),
					Limit: 120000, Window: 15 * time.Minute, Remaining: 120000, Metered: true,
				}); err != nil {
					b.StopTimer()
					b.Fatalf("settle: %v", err)
				}
			}
		})
	}
}
