package redisfake_test

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/testing/redisfake"
)

func TestNew_clientAndServerSeeTheSameStore(t *testing.T) {
	r := redisfake.New(t)
	ctx := context.Background()

	if err := r.Client.Set(ctx, "k", "v", 0).Err(); err != nil {
		t.Fatalf("set: %v", err)
	}
	if got, err := r.Server.Get("k"); err != nil || got != "v" {
		t.Fatalf("server Get = %q, %v; want v", got, err)
	}

	r.Server.Set("direct", "from-server")
	if got, err := r.Client.Get(ctx, "direct").Result(); err != nil || got != "from-server" {
		t.Fatalf("client Get = %q, %v; want from-server", got, err)
	}
}

func TestNew_serverDrivesExpiry(t *testing.T) {
	r := redisfake.New(t)
	ctx := context.Background()

	if err := r.Client.Set(ctx, "ttl", "v", time.Minute).Err(); err != nil {
		t.Fatalf("set: %v", err)
	}
	if got := r.Server.TTL("ttl"); got != time.Minute {
		t.Fatalf("TTL = %v, want 1m", got)
	}

	r.Server.FastForward(2 * time.Minute)
	if r.Server.Exists("ttl") {
		t.Fatal("key survived FastForward past its TTL")
	}
}

func TestNew_isolatedPerTest(t *testing.T) {
	a := redisfake.New(t)
	b := redisfake.New(t)
	if a.Addr() == b.Addr() {
		t.Fatal("two fakes share an address")
	}

	ctx := context.Background()
	if err := a.Client.Set(ctx, "only-in-a", "1", 0).Err(); err != nil {
		t.Fatalf("set: %v", err)
	}
	if b.Server.Exists("only-in-a") {
		t.Fatal("write leaked between fakes")
	}
}
