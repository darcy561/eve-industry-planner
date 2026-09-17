package redisfake_test

import (
	"context"
	"testing"
	"testing/synctest"
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

// The reason NewForBubble exists: a caller that waits on a lease expiring runs
// to completion on simulated time, with no wall clock spent.
func TestNewForBubble_leaseExpiryUnderSynctest(t *testing.T) {
	r := redisfake.NewForBubble(t)

	started := time.Now()
	synctest.Test(t, func(t *testing.T) {
		ctx := context.Background()
		if err := r.Client.Set(ctx, "lease", "held", 15*time.Second).Err(); err != nil {
			t.Fatalf("set: %v", err)
		}

		r.Advance(14 * time.Second)
		if got, err := r.Client.Get(ctx, "lease").Result(); err != nil || got != "held" {
			t.Fatalf("lease at 14s = %q, %v; want it still held", got, err)
		}

		r.Advance(2 * time.Second)
		if err := r.Client.Get(ctx, "lease").Err(); err == nil {
			t.Fatal("lease outlived its 15s TTL")
		}
	})

	if spent := time.Since(started); spent > 5*time.Second {
		t.Fatalf("16s of simulated time cost %s of wall clock", spent)
	}
}

// Several commands in flight must not force a dial, which would start a
// goroutine outside the bubble and abort the test.
func TestNewForBubble_simultaneousCommands(t *testing.T) {
	r := redisfake.NewForBubble(t)

	synctest.Test(t, func(t *testing.T) {
		ctx := context.Background()
		done := make(chan error, 8)
		for i := range 8 {
			go func() { done <- r.Client.Set(ctx, "k", i, time.Minute).Err() }()
		}
		for range 8 {
			if err := <-done; err != nil {
				t.Fatalf("concurrent set: %v", err)
			}
		}
	})
}
