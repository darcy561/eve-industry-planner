package ledgerbench_test

import (
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/testing/ledgerbench"

	"github.com/redis/go-redis/v9"
)

// One bucket can only hold so many fields — slots times the class and endpoint
// combinations actually seen. These go well past that, to find where a hash
// stops behaving rather than to model anything real.
func TestOneHashAtExtremeFieldCounts(t *testing.T) {
	rdb := client(t)

	fmt.Printf("\n  %-8s %-11s %11s %12s %12s\n", "fields", "encoding", "memory", "write", "read")
	for _, fields := range []int{1_800, 5_000, 20_000, 50_000} {
		key := fmt.Sprintf("extreme:%d", fields)
		encoding, bytes := buildHash(t, rdb, key, fields)
		last := fmt.Sprintf("%d|background|/markets/orders/", fields-1)
		fmt.Printf("  %-8d %-11s %10dK %12s %12s\n", fields, encoding, bytes/1024,
			timeWrite(t, rdb, key, last, 200).Round(time.Microsecond),
			timeRead(t, rdb, key, 50).Round(time.Microsecond))
		_ = rdb.Del(t.Context(), key).Err()
	}
	fmt.Println()
}

func usedMemory(t testing.TB, rdb *redis.Client) int64 {
	t.Helper()
	var used int64
	info, err := rdb.Info(t.Context(), "memory").Result()
	if err != nil {
		t.Fatalf("info: %v", err)
	}
	for line := range splitLines(info) {
		if _, err := fmt.Sscanf(line, "used_memory:%d", &used); err == nil && used > 0 {
			return used
		}
	}
	return 0
}

func splitLines(s string) func(func(string) bool) {
	return func(yield func(string) bool) {
		start := 0
		for i := range len(s) {
			if s[i] == '\n' {
				if !yield(s[start:i]) {
					return
				}
				start = i + 1
			}
		}
	}
}

// The growth path that would actually arrive: authenticated calls give every
// character its own bucket. One bucket is cheap in either scheme; the question
// is what a thousand of them cost, and whether reading one still behaves while
// the rest exist.
func TestManyBucketsAtOnce(t *testing.T) {
	rdb := client(t)
	const chargesPerBucket = 2000

	fmt.Printf("\n  %-8s %-8s %12s %14s %14s\n", "buckets", "scheme", "total memory", "per bucket", "read one")
	for _, buckets := range []int{50, 200, 500} {
		for _, scheme := range []ledgerbench.Scheme{ledgerbench.Ledger(), ledgerbench.Hash()} {
			if err := rdb.FlushAll(t.Context()).Err(); err != nil {
				t.Fatalf("flush: %v", err)
			}
			before := usedMemory(t, rdb)

			for b := range buckets {
				key := fmt.Sprintf("many:%s:%d", scheme.Name(), b)
				if err := scheme.Prefill(t.Context(), rdb, key, "background", "/markets/orders/", chargesPerBucket); err != nil {
					t.Fatalf("prefill: %v", err)
				}
			}
			total := usedMemory(t, rdb) - before

			// Reading one bucket while the others sit there.
			one := fmt.Sprintf("many:%s:0", scheme.Name())
			start := time.Now()
			const reads = 100
			for range reads {
				if _, err := scheme.Charge(t.Context(), rdb, one, "background", "/markets/orders/", 1); err != nil {
					t.Fatalf("charge: %v", err)
				}
			}
			per := time.Since(start) / reads

			fmt.Printf("  %-8d %-8s %11dM %13dK %14s\n", buckets, scheme.Name(),
				total/(1024*1024), total/int64(buckets)/1024, per.Round(time.Microsecond))
		}
	}
	fmt.Println()
}
