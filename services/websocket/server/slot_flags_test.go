package server

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/shared/wsplacement"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestSyncSlotFullFlagSetAndClear(t *testing.T) {
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "2")
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "websocket-test-1")

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Stack:        &stackservices.Clients{Redis: rdb},
		shutdownChan: make(chan struct{}),
	}
	key := wsplacement.FullPrefix + instanceid.Replica()
	ctx := context.Background()

	s.syncSlotFullFlag(ctx, 2)
	if got, err := rdb.Get(ctx, key).Result(); err != nil || got != "1" {
		t.Fatalf("expected full key set, got %q err=%v", got, err)
	}

	s.syncSlotFullFlag(ctx, 1)
	if n, err := rdb.Exists(ctx, key).Result(); err != nil || n != 0 {
		t.Fatalf("expected full key cleared, exists=%d err=%v", n, err)
	}
}

func TestSyncSlotSoftFlagSetAndClear(t *testing.T) {
	t.Setenv("WS_SLOT_TARGET_CLIENTS", "2")
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "websocket-soft-1")

	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Stack:        &stackservices.Clients{Redis: rdb},
		shutdownChan: make(chan struct{}),
	}
	key := wsplacement.SoftPrefix + instanceid.Replica()
	ctx := context.Background()

	s.syncSlotSoftFlag(ctx, 2)
	if got, err := rdb.Get(ctx, key).Result(); err != nil || got != "1" {
		t.Fatalf("expected soft key set, got %q err=%v", got, err)
	}

	s.syncSlotSoftFlag(ctx, 1)
	if n, err := rdb.Exists(ctx, key).Result(); err != nil || n != 0 {
		t.Fatalf("expected soft key cleared, exists=%d err=%v", n, err)
	}
}

func TestContextUntilShutdownCancels(t *testing.T) {
	s := &Server{shutdownChan: make(chan struct{})}
	ctx, cancel := s.contextUntilShutdown()
	defer cancel()

	close(s.shutdownChan)
	select {
	case <-ctx.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("context not cancelled after shutdownChan close")
	}
}
