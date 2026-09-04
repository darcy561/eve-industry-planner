// Package redislive gates a test on a real Redis and gives it a namespace to
// work in.
//
// Miniredis runs Lua, but it is a reimplementation: TIME, sorted-set ordering
// and script atomicity are exactly the things a fake is most likely to get
// subtly right and materially different. A script that decides a rate-limit
// budget should meet the real interpreter at least once.
package redislive

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// Gate is the environment variable that opts a run in to live Redis, and Addr
// overrides where to find it.
const (
	Gate = "EIP_REDIS_PARITY_LIVE"
	Addr = "EIP_REDIS_PARITY_ADDR"
)

const dial = 10 * time.Second

// Require connects to a Redis, or skips the test.
//
// Point it at a throwaway server, not the stack's: these tests write and delete
// keys under their own prefix, and a rate-limit budget is shared state the
// running system is relying on.
func Require(t *testing.T) *redis.Client {
	t.Helper()
	if os.Getenv(Gate) != "1" {
		t.Skipf("set %s=1 (and %s) to run against a real Redis", Gate, Addr)
	}

	addr := os.Getenv(Addr)
	if addr == "" {
		addr = "127.0.0.1:6379"
	}

	client := redis.NewClient(&redis.Options{Addr: addr, Password: os.Getenv("EIP_REDIS_PARITY_PASSWORD")})
	ctx, cancel := context.WithTimeout(context.Background(), dial)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("redis at %s: %v", addr, err)
	}

	t.Cleanup(func() { _ = client.Close() })
	return client
}

// Clean removes every key under a prefix, so a run leaves nothing behind.
func Clean(t *testing.T, client *redis.Client, prefix string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), dial)
	defer cancel()

	var cursor uint64
	for {
		keys, next, err := client.Scan(ctx, cursor, prefix+"*", 500).Result()
		if err != nil {
			t.Fatalf("scan %s: %v", prefix, err)
		}
		if len(keys) > 0 {
			if err := client.Del(ctx, keys...).Err(); err != nil {
				t.Fatalf("delete under %s: %v", prefix, err)
			}
		}
		if next == 0 {
			return
		}
		cursor = next
	}
}
