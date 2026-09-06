package ledgerbench_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// buildHash fills one hash with n fields carrying TTLs, as a bucket's slots
// would, and returns how it ended up encoded and how much it cost.
func buildHash(t testing.TB, rdb *redis.Client, key string, fields int) (encoding string, bytes int64) {
	t.Helper()
	if err := rdb.Del(t.Context(), key).Err(); err != nil {
		t.Fatalf("del: %v", err)
	}
	expires := time.Now().Add(time.Hour).Unix()

	pipe := rdb.Pipeline()
	for i := range fields {
		f := fmt.Sprintf("%d|background|/markets/orders/", i)
		pipe.HIncrBy(t.Context(), key, f, 7)
		pipe.Do(t.Context(), "HEXPIREAT", key, expires, "FIELDS", 1, f)
	}
	if _, err := pipe.Exec(t.Context()); err != nil {
		t.Fatalf("build: %v", err)
	}

	encoding, err := rdb.ObjectEncoding(t.Context(), key).Result()
	if err != nil {
		t.Fatalf("encoding: %v", err)
	}
	bytes, err = rdb.MemoryUsage(t.Context(), key).Result()
	if err != nil {
		t.Fatalf("memory: %v", err)
	}
	return encoding, bytes
}

// timeWrite is the cost of touching one field that already exists — the write
// the limiter makes on every call. A listpack is a flat array, so this is a
// scan; a hashtable is a lookup.
func timeWrite(t testing.TB, rdb *redis.Client, key, field string, n int) time.Duration {
	t.Helper()
	start := time.Now()
	for range n {
		if err := rdb.HIncrBy(t.Context(), key, field, 1).Err(); err != nil {
			t.Fatalf("hincrby: %v", err)
		}
	}
	return time.Since(start) / time.Duration(n)
}

func timeRead(t testing.TB, rdb *redis.Client, key string, n int) time.Duration {
	t.Helper()
	start := time.Now()
	for range n {
		if err := rdb.HGetAll(t.Context(), key).Err(); err != nil {
			t.Fatalf("hgetall: %v", err)
		}
	}
	return time.Since(start) / time.Duration(n)
}

// Redis switches a hash from a flat listpack to a hashtable at
// hash-max-listpack-entries. Reads and writes behave differently either side of
// it, so where a bucket lands is a design input rather than an implementation
// detail.
func TestCostEitherSideOfTheListpackBoundary(t *testing.T) {
	rdb := client(t)

	threshold, err := rdb.ConfigGet(t.Context(), "hash-max-listpack-entries").Result()
	if err != nil {
		t.Fatalf("config get: %v", err)
	}
	fmt.Printf("\n  hash-max-listpack-entries = %s\n\n", threshold["hash-max-listpack-entries"])
	fmt.Printf("  %-8s %-11s %10s %12s %12s\n", "fields", "encoding", "memory", "write", "read")

	for _, fields := range []int{100, 300, 500, 520, 1000, 1800} {
		key := fmt.Sprintf("enc:%d", fields)
		encoding, bytes := buildHash(t, rdb, key, fields)
		// The last field added is the worst case for a listpack scan.
		last := fmt.Sprintf("%d|background|/markets/orders/", fields-1)
		fmt.Printf("  %-8d %-11s %9dB %12s %12s\n", fields, encoding, bytes,
			timeWrite(t, rdb, key, last, 300).Round(time.Microsecond),
			timeRead(t, rdb, key, 200).Round(time.Microsecond))
	}
	fmt.Println()
}

// A busy bucket lands above the default threshold. Raising it keeps the hash in
// a listpack — cheaper in memory, but every write scans the array.
func TestWhetherRaisingTheThresholdPays(t *testing.T) {
	rdb := client(t)
	const fields = 1800

	original, err := rdb.ConfigGet(t.Context(), "hash-max-listpack-entries").Result()
	if err != nil {
		t.Fatalf("config get: %v", err)
	}
	t.Cleanup(func() {
		_ = rdb.ConfigSet(t.Context(), "hash-max-listpack-entries",
			original["hash-max-listpack-entries"]).Err()
	})

	fmt.Printf("\n  %-24s %-11s %10s %12s %12s\n", "threshold", "encoding", "memory", "write", "read")
	for _, threshold := range []string{"512", "4096"} {
		if err := rdb.ConfigSet(t.Context(), "hash-max-listpack-entries", threshold).Err(); err != nil {
			t.Fatalf("config set: %v", err)
		}
		key := "threshold:" + threshold
		encoding, bytes := buildHash(t, rdb, key, fields)
		last := fmt.Sprintf("%d|background|/markets/orders/", fields-1)
		fmt.Printf("  %-24s %-11s %9dB %12s %12s\n", threshold, encoding, bytes,
			timeWrite(t, rdb, key, last, 300).Round(time.Microsecond),
			timeRead(t, rdb, key, 200).Round(time.Microsecond))
	}
	fmt.Println()
}
