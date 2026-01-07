package redis

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// SaveJSON stores any JSON-serializable value at the provided key.
func SaveJSON(ctx context.Context, client *redis.Client, key string, value any, ttl time.Duration) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return client.Set(ctx, key, b, ttl).Err()
}

// GetJSON retrieves a JSON value from the provided key and unmarshals it into the target.
func GetJSON(ctx context.Context, client *redis.Client, key string, target any) error {
	val, err := client.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(val), target)
}

// SetString stores a string value at the provided key.
func SetString(ctx context.Context, client *redis.Client, key, value string, ttl time.Duration) error {
	return client.Set(ctx, key, value, ttl).Err()
}

// GetString retrieves a string value from the provided key.
func GetString(ctx context.Context, client *redis.Client, key string) (string, error) {
	return client.Get(ctx, key).Result()
}
