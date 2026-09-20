package redis

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
)

// scanBatch is how many keys a scan asks for per round trip. It is a hint, not
// a limit: Redis may return more or fewer.
const scanBatch = 200

// ScanPrefix calls fn with each batch of keys under a prefix.
//
// Scanning never blocks the server the way KEYS does, but it also gives no
// snapshot: a key added or removed while scanning may or may not appear, and a
// key present throughout may be returned twice. Callers must tolerate both.
//
// fn returning an error stops the scan and returns it.
func (r *Redis) ScanPrefix(ctx context.Context, prefix string, fn func(keys []string) error) error {
	if prefix == "" {
		return ErrEmptyPrefix
	}
	c, err := r.client()
	if err != nil {
		return err
	}

	var cursor uint64
	for {
		keys, next, err := c.Scan(ctx, cursor, prefix+"*", scanBatch).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			if err := fn(keys); err != nil {
				return err
			}
		}
		if next == 0 {
			return nil
		}
		cursor = next
	}
}

// SuffixAfter returns the part of key after prefix, and whether it had it —
// how a scan turns a key back into the id it was built from.
func SuffixAfter(key, prefix string) (string, bool) {
	return strings.CutPrefix(key, prefix)
}

// TimeToLive reports what is left of a key's lifetime. A key held without one
// answers zero, which is how a caller tells a key that will age out from a key
// that will not.
func (r *Redis) TimeToLive(ctx context.Context, key string) (time.Duration, error) {
	c, err := r.client()
	if err != nil {
		return 0, err
	}

	left, err := c.TTL(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	// The driver answers -1 for a key with no expiry and -2 for one that is
	// gone; neither is a lifetime, and both mean "will not age out on its own".
	if left < 0 {
		return 0, nil
	}
	return left, nil
}

// Unlink removes keys in the background, for a caller deleting enough of them
// that freeing the memory inline would stall the instance.
func (r *Redis) Unlink(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	c, err := r.client()
	if err != nil {
		return err
	}
	return c.Unlink(ctx, keys...).Err()
}

// Delete removes keys, and reports how many existed. Absent keys are not an
// error.
func (r *Redis) Delete(ctx context.Context, keys ...string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	c, err := r.client()
	if err != nil {
		return 0, err
	}
	return c.Del(ctx, keys...).Result()
}

// Exists reports whether a key is present.
func (r *Redis) Exists(ctx context.Context, key string) (bool, error) {
	c, err := r.client()
	if err != nil {
		return false, err
	}
	count, err := c.Exists(ctx, key).Result()
	return count > 0, err
}

// scratchPrefix namespaces the short-lived keys this package creates for
// operations that need somewhere to put an intermediate result.
const scratchPrefix = "eip:scratch:"

// ttlScratch is the backstop for a scratch key whose owner never got to delete
// it. Every use deletes its own key; this only covers a process that died
// between creating one and removing it, and unique keys would otherwise
// accumulate one per lost call.
const ttlScratch = 10 * time.Minute

// scratchKey names a temporary key unique to one call, so concurrent callers —
// including the same code on another replica — cannot overwrite each other's
// working value.
func scratchKey(purpose string) string {
	return scratchPrefix + purpose + ":" + uuid.NewString()
}
