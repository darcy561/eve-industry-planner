package redis

import (
	"context"
	"eve-industry-planner/shared/jsoncodec"
	"time"

	"github.com/redis/go-redis/v9"
)

// PutFields writes fields into a hash and applies the key's lifetime. Hash
// writes carry no expiry of their own, so it is set alongside and refreshed by
// each write. No fields is a no-op.
func (r *Redis) PutFields(ctx context.Context, key string, fields map[string]any, ttl time.Duration) error {
	if len(fields) == 0 {
		return nil
	}
	c, err := r.client()
	if err != nil {
		return err
	}
	if err := c.HSet(ctx, key, fields).Err(); err != nil {
		return err
	}
	return r.expire(ctx, key, ttl)
}

// Fields reads every field of a hash. A key with none returns an empty map
// rather than an error.
func (r *Redis) Fields(ctx context.Context, key string) (map[string]string, error) {
	c, err := r.client()
	if err != nil {
		return nil, err
	}
	return c.HGetAll(ctx, key).Result()
}

// DeleteFields removes named fields from a hash. Removing the last field
// removes the key. No fields is a no-op.
func (r *Redis) DeleteFields(ctx context.Context, key string, fields ...string) error {
	_, err := r.RemoveFields(ctx, key, fields...)
	return err
}

// RemoveFields deletes fields from a hash and reports how many were present.
func (r *Redis) RemoveFields(ctx context.Context, key string, fields ...string) (int64, error) {
	if len(fields) == 0 {
		return 0, nil
	}
	c, err := r.client()
	if err != nil {
		return 0, err
	}
	return c.HDel(ctx, key, fields...).Result()
}

// ScoredMember is one member of a sorted set with the score that orders it.
type ScoredMember struct {
	Member string
	Score  float64
}

// PutScored adds or moves a member in a sorted set, and applies the key's
// lifetime. A member already present moves to the new score rather than being
// duplicated.
func (r *Redis) PutScored(ctx context.Context, key, member string, score float64, ttl time.Duration) error {
	_, err := r.AddScored(ctx, key, member, score, ttl)
	return err
}

// AddScored stores a member and reports whether it was new to the set. A member
// already present has its score replaced and is not counted as added.
func (r *Redis) AddScored(ctx context.Context, key, member string, score float64, ttl time.Duration) (bool, error) {
	c, err := r.client()
	if err != nil {
		return false, err
	}
	added, err := c.ZAdd(ctx, key, redis.Z{Score: score, Member: member}).Result()
	if err != nil {
		return false, err
	}
	return added > 0, r.expire(ctx, key, ttl)
}

// Scored reads every member of a sorted set, lowest score first.
func (r *Redis) Scored(ctx context.Context, key string) ([]ScoredMember, error) {
	c, err := r.client()
	if err != nil {
		return nil, err
	}

	stored, err := c.ZRangeWithScores(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	members := make([]ScoredMember, 0, len(stored))
	for _, z := range stored {
		member, ok := z.Member.(string)
		if !ok {
			continue
		}
		members = append(members, ScoredMember{Member: member, Score: z.Score})
	}
	return members, nil
}

// GetManyJSON reads several keys in one round trip. A key that is absent, or
// holds something that will not decode, is absent from the result rather than
// an error — the caller asked for what is there.
func GetManyJSON[T any](ctx context.Context, r *Redis, keys []string) (map[string]*T, error) {
	found := make(map[string]*T, len(keys))
	if len(keys) == 0 {
		return found, nil
	}
	c, err := r.client()
	if err != nil {
		return nil, err
	}

	values, err := c.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}

	for i, key := range keys {
		raw, ok := values[i].(string)
		if !ok {
			continue
		}
		value := new(T)
		if err := jsoncodec.Unmarshal([]byte(raw), value); err != nil {
			continue
		}
		found[key] = value
	}
	return found, nil
}
