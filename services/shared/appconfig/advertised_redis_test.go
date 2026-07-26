package appconfig

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestResolveAdvertisedAppVersion_prefersRedis(t *testing.T) {
	t.Setenv("FRONTEND_APP_VERSION", "from-env")
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	ctx := context.Background()
	if got := ResolveAdvertisedAppVersion(ctx, rdb); got != "from-env" {
		t.Fatalf("empty redis: got %q want from-env", got)
	}
	if err := SetAdvertisedAppVersion(ctx, rdb, "from-redis"); err != nil {
		t.Fatal(err)
	}
	if got := ResolveAdvertisedAppVersion(ctx, rdb); got != "from-redis" {
		t.Fatalf("redis set: got %q want from-redis", got)
	}
}

func TestResolveAdvertisedAppVersion_nilRedisFallsBack(t *testing.T) {
	t.Setenv("APP_VERSION", "0.9.0")
	t.Setenv("FRONTEND_APP_VERSION", "")
	t.Setenv("APP_VERSION_NUMBER", "")
	if got := ResolveAdvertisedAppVersion(context.Background(), nil); got != "0.9.0" {
		t.Fatalf("got %q", got)
	}
}

func TestSetAdvertisedAppVersion_publishes(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	ctx := context.Background()
	pubsub := rdb.Subscribe(ctx, AdvertisedVersionChannel())
	t.Cleanup(func() { _ = pubsub.Close() })
	if _, err := pubsub.Receive(ctx); err != nil {
		t.Fatal(err)
	}

	if err := SetAdvertisedAppVersion(ctx, rdb, "1.2.3"); err != nil {
		t.Fatal(err)
	}
	msg := <-pubsub.Channel()
	if msg == nil || msg.Payload != "1.2.3" {
		t.Fatalf("publish payload: %+v", msg)
	}
	if got, err := rdb.Get(ctx, AdvertisedVersionKey()).Result(); err != nil || got != "1.2.3" {
		t.Fatalf("GET: %q err=%v", got, err)
	}
}
