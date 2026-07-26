package config

import (
	"strings"
	"testing"
)

func TestMongoURLAPI_fallbackAndPrefer(t *testing.T) {
	t.Setenv("MONGO_HOST", "mongo")
	t.Setenv("MONGO_PORT", "27017")
	t.Setenv("MONGO_USERNAME", "shared")
	t.Setenv("MONGO_PASSWORD", "sharedpass")
	t.Setenv("MONGO_USERNAME_API", "")
	t.Setenv("MONGO_PASSWORD_API", "")

	got, err := MongoURLAPI()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "shared:sharedpass@mongo:27017") {
		t.Fatalf("fallback URI: %s", got)
	}

	t.Setenv("MONGO_USERNAME_API", "apiuser")
	t.Setenv("MONGO_PASSWORD_API", "apipass")
	got, err = MongoURLAPI()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "apiuser:apipass@mongo:27017") {
		t.Fatalf("prefer API URI: %s", got)
	}

	t.Setenv("MONGO_PASSWORD_API", "")
	if _, err := MongoURLAPI(); err == nil {
		t.Fatal("expected error for incomplete API pair")
	}
}

func TestRedisURLAPI_fallbackAndPrefer(t *testing.T) {
	t.Setenv("REDIS_HOST", "redis")
	t.Setenv("REDIS_PORT", "6379")
	t.Setenv("REDIS_PASSWORD", "sharedredis")
	t.Setenv("REDIS_USERNAME_API", "")
	t.Setenv("REDIS_PASSWORD_API", "")

	got, err := RedisURLAPI()
	if err != nil {
		t.Fatal(err)
	}
	if got != "redis://:sharedredis@redis:6379" {
		t.Fatalf("fallback: %s", got)
	}

	t.Setenv("REDIS_PASSWORD_API", "apiredis")
	got, err = RedisURLAPI()
	if err != nil {
		t.Fatal(err)
	}
	if got != "redis://:apiredis@redis:6379" {
		t.Fatalf("prefer password: %s", got)
	}

	t.Setenv("REDIS_USERNAME_API", "apiacl")
	got, err = RedisURLAPI()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "apiacl") || !strings.Contains(got, "apiredis") {
		t.Fatalf("prefer ACL user: %s", got)
	}

	t.Setenv("REDIS_PASSWORD_API", "")
	if _, err := RedisURLAPI(); err == nil {
		t.Fatal("expected error when username set without password")
	}
}
