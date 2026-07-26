package server

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestParseDrainSignal(t *testing.T) {
	t.Parallel()
	sig, ok := parseDrainSignal(`{"slot":"websocket-2","action":"evacuate","via":"ws-placement-ops"}`)
	if !ok || sig.Slot != "websocket-2" || sig.Action != "evacuate" || sig.Via != "ws-placement-ops" {
		t.Fatalf("json parse: %+v ok=%v", sig, ok)
	}
	sig, ok = parseDrainSignal("websocket-1")
	if !ok || sig.Slot != "websocket-1" || sig.Action != "unknown" {
		t.Fatalf("legacy parse: %+v ok=%v", sig, ok)
	}
	if _, ok := parseDrainSignal(""); ok {
		t.Fatal("empty should fail")
	}
	msg := drainExplainMessage(drainSignal{Action: "evacuate", Via: "ws-placement-ops"}, "websocket-2")
	if !containsAll(msg, "websocket-2", "evacuated", "ws-placement-ops") {
		t.Fatalf("explain message weak: %q", msg)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !stringContainsFold(s, p) {
			return false
		}
	}
	return true
}

func stringContainsFold(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if equalFoldASCII(s[i:i+len(sub)], sub) {
					return true
				}
			}
			return false
		})())
}

func equalFoldASCII(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}

func TestSubscribeCordonDrain_TriggersOnlyForOwnSlot(t *testing.T) {
	t.Parallel()
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	var hits atomic.Int32
	var lastAction atomic.Value
	trigger := func(sig drainSignal) {
		hits.Add(1)
		lastAction.Store(sig.Action)
	}

	done := make(chan error, 1)
	go func() {
		done <- s.subscribeCordonDrain(ctx, rdb, "eip:ws:drain:v1", "websocket-2", trigger)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if mr.PubSubNumSub("eip:ws:drain:v1")["eip:ws:drain:v1"] >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	payloadOther := `{"slot":"websocket-1","action":"evacuate","via":"ws-placement-ops"}`
	if err := rdb.Publish(ctx, "eip:ws:drain:v1", payloadOther).Err(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if hits.Load() != 0 {
		t.Fatalf("other slot should not trigger, hits=%d", hits.Load())
	}

	payloadOwn := `{"slot":"websocket-2","action":"evacuate","via":"ws-placement-ops"}`
	if err := rdb.Publish(ctx, "eip:ws:drain:v1", payloadOwn).Err(); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && hits.Load() < 1 {
		time.Sleep(10 * time.Millisecond)
	}
	if hits.Load() != 1 {
		t.Fatalf("want 1 hit for own slot, got %d", hits.Load())
	}
	if lastAction.Load() != "evacuate" {
		t.Fatalf("action=%v", lastAction.Load())
	}

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("subscribe did not exit after cancel")
	}
}

func TestIsOwnSlotCordoned(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "websocket-9")

	s := &Server{Stack: &stackservices.Clients{Redis: rdb}}
	ctx := context.Background()
	if s.isOwnSlotCordoned(ctx) {
		t.Fatal("expected not cordoned")
	}
	if err := rdb.Set(ctx, "eip:ws:cordon:v1:websocket-9", "1", 0).Err(); err != nil {
		t.Fatal(err)
	}
	if !s.isOwnSlotCordoned(ctx) {
		t.Fatal("expected cordoned")
	}
}
