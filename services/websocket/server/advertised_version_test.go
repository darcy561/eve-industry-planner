package server

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"testing"
	"time"

	"eve-industry-planner/shared/appconfig"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestSubscribeAdvertisedVersion_FansOut(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Clients: make(map[string]*Client),
		Stack: &stackservices.Clients{Redis: rdb},
	}
	sendCh := make(chan []byte, 1)
	s.Clients["c1"] = &Client{id: "c1", Send: sendCh}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- s.subscribeAdvertisedVersion(ctx, rdb, appconfig.AdvertisedVersionChannel())
	}()

	deadline := time.Now().Add(2 * time.Second)
	for {
		if mr.PubSubNumSub(appconfig.AdvertisedVersionChannel())[appconfig.AdvertisedVersionChannel()] >= 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for subscribe")
		}
		time.Sleep(10 * time.Millisecond)
	}

	if err := appconfig.SetAdvertisedAppVersion(context.Background(), rdb, "9.9.9"); err != nil {
		t.Fatal(err)
	}

	select {
	case payload := <-sendCh:
		if string(payload) != `{"app_version":"9.9.9","type":"app_version"}` &&
			string(payload) != `{"type":"app_version","app_version":"9.9.9"}` {
			// map marshal order is defined for two fixed keys in Go 1.x as sorted? Actually
			// encoding/json sorts map keys alphabetically — app_version before type.
			t.Fatalf("payload: %s", payload)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no fan-out")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("subscribe did not exit")
	}
}

func TestResolveAdvertisedAppVersion_onServer(t *testing.T) {
	t.Setenv("APP_VERSION", "env-ver")
	t.Setenv("FRONTEND_APP_VERSION", "")
	t.Setenv("APP_VERSION_NUMBER", "")
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	s := &Server{Stack: &stackservices.Clients{Redis: rdb}}
	if got := s.resolveAdvertisedAppVersion(context.Background()); got != "env-ver" {
		t.Fatalf("got %q", got)
	}
	_ = rdb.Set(context.Background(), appconfig.AdvertisedVersionKey(), "redis-ver", 0)
	if got := s.resolveAdvertisedAppVersion(context.Background()); got != "redis-ver" {
		t.Fatalf("got %q", got)
	}
}
