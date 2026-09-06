package esiclient_test

import (
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"
)

// The refusal path is the one that runs when the ledger is longest, so what it
// reads matters more than what the granted path reads.
func BenchmarkRefusal(b *testing.B) {
	for _, size := range []int{1000, 3000} {
		b.Run(fmt.Sprintf("ledger=%d", size), func(b *testing.B) {
			store := esiclient.NewStore(benchRedis(b), esiclient.DefaultConfig())
			bucket := esiclient.Bucket{Group: "market-order", User: esiclient.AnonymousUser}

			// A bucket filled to refusal: the allowance is exactly what the
			// charges below consume.
			limit := size * 2
			for range size {
				grant, err := store.Reserve(b.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1)
				if err != nil || !grant.Granted {
					break
				}
				_ = store.Settle(b.Context(), grant.Reservations[0], esiclient.Outcome{
					Attempted: true, Status: 200, Cost: 2, ObservedAt: time.Now(),
					Limit: limit, Window: 15 * time.Minute, Remaining: -1, Metered: true,
				})
			}

			b.ResetTimer()
			for range b.N {
				if _, err := store.Reserve(b.Context(), bucket, esiclient.ClassBackground, esiclient.EndpointPolicy{}, 1); err != nil {
					b.StopTimer()
					b.Fatalf("reserve: %v", err)
				}
			}
		})
	}
}
