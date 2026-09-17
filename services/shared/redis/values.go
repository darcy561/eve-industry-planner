package redis

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"time"
)

// PutJSON stores value as JSON. A zero ttl stores it without an expiry.
func (r *Redis) PutJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	c, err := r.client()
	if err != nil {
		return err
	}
	b, err := jsoncodec.Marshal(value)
	if err != nil {
		return err
	}
	return c.Set(ctx, key, b, ttl).Err()
}

// GetJSON reads key into target. A missing key returns [redis.Nil].
func (r *Redis) GetJSON(ctx context.Context, key string, target any) error {
	c, err := r.client()
	if err != nil {
		return err
	}
	value, err := c.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return jsoncodec.Unmarshal([]byte(value), target)
}

// PutString stores a string. A zero ttl stores it without an expiry.
func (r *Redis) PutString(ctx context.Context, key, value string, ttl time.Duration) error {
	c, err := r.client()
	if err != nil {
		return err
	}
	return c.Set(ctx, key, value, ttl).Err()
}

// GetString reads a string. A missing key returns [redis.Nil].
func (r *Redis) GetString(ctx context.Context, key string) (string, error) {
	c, err := r.client()
	if err != nil {
		return "", err
	}
	return c.Get(ctx, key).Result()
}

// PutIfAbsent stores a value only when the key has none, and reports whether it
// did. It is the primitive a lock is built from.
func (r *Redis) PutIfAbsent(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
	c, err := r.client()
	if err != nil {
		return false, err
	}
	return c.SetNX(ctx, key, value, ttl).Result()
}

// GetInt reads a key holding a number, reporting [ErrNotFound] when it is
// absent so a caller can tell "nothing counted yet" from a failed read.
func (r *Redis) GetInt(ctx context.Context, key string) (int, error) {
	c, err := r.client()
	if err != nil {
		return 0, err
	}
	return c.Get(ctx, key).Int()
}

// forever marks a key with no expiry, so that a key without a lifetime reads as
// a decision rather than an omission.
const forever time.Duration = 0

// expire applies a lifetime to a key written by a command that carries none,
// such as ZAdd or HSet. A lifetime of forever leaves the key without one.
func (r *Redis) expire(ctx context.Context, key string, ttl time.Duration) error {
	c, err := r.client()
	if err != nil {
		return err
	}
	if ttl == forever {
		return nil
	}
	return c.Expire(ctx, key, ttl).Err()
}
