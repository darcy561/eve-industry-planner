package config

import (
	"strings"
	"testing"
)

func TestMongoURL(t *testing.T) {
	t.Setenv("MONGO_HOST", "mongo")
	t.Setenv("MONGO_PORT", "27017")
	t.Setenv("MONGO_USERNAME", "shared")
	t.Setenv("MONGO_PASSWORD", "sharedpass")

	got, err := MongoURL()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "shared:sharedpass@mongo:27017") {
		t.Fatalf("URI: %s", got)
	}
}

func TestRedisURL(t *testing.T) {
	t.Setenv("REDIS_HOST", "redis")
	t.Setenv("REDIS_PORT", "6379")
	t.Setenv("REDIS_PASSWORD", "sharedredis")

	got, err := RedisURL()
	if err != nil {
		t.Fatal(err)
	}
	if got != "redis://:sharedredis@redis:6379" {
		t.Fatalf("got %s", got)
	}
}
