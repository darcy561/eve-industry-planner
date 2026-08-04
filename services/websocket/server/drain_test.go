package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"eve-industry-planner/shared/core/instanceid"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/shared/wsplacement"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestDrainForRollSetsDrainingAndEmptiesWait(t *testing.T) {
	t.Parallel()
	s := &Server{Clients: make(map[string]*Client)}
	if s.IsDraining() {
		t.Fatal("expected not draining")
	}
	started := time.Now()
	s.DrainForRoll(context.Background())
	if !s.IsDraining() {
		t.Fatal("expected draining after DrainForRoll")
	}
	if time.Since(started) > time.Second {
		t.Fatal("empty Clients wait took too long")
	}
	// Idempotent draining flag.
	s.DrainForRoll(context.Background())
	if !s.IsDraining() {
		t.Fatal("still draining")
	}
}

func TestDrainForRollWaitRespectsCanceledContext(t *testing.T) {
	t.Parallel()
	s := &Server{
		Clients: map[string]*Client{
			"stuck": {id: "stuck"},
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	started := time.Now()
	s.DrainForRoll(ctx)
	if time.Since(started) > time.Second {
		t.Fatal("DrainForRoll blocked too long on canceled context")
	}
	if !s.IsDraining() {
		t.Fatal("expected draining")
	}
	if s.ConnectedCount() != 1 {
		t.Fatalf("stuck client still present: %d", s.ConnectedCount())
	}
}

func TestWriteFrameNilConn(t *testing.T) {
	t.Parallel()
	c := &Client{id: "n"}
	if err := c.writeFrame(1, []byte("x"), time.Millisecond); err == nil {
		t.Fatal("expected error for nil conn")
	}
}

func TestDrainForRollReKicksWhileWaiting(t *testing.T) {
	t.Parallel()
	s := &Server{Clients: make(map[string]*Client)}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		s.DrainForRoll(ctx)
		close(done)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && !s.IsDraining() {
		time.Sleep(5 * time.Millisecond)
	}
	if !s.IsDraining() {
		t.Fatal("drain did not start")
	}

	// Late arrival after first kick snapshot — wait loop should re-kick (nil conn is a no-op write).
	s.ClientsMu.Lock()
	s.Clients["late"] = &Client{id: "late"}
	s.ClientsMu.Unlock()

	time.Sleep(400 * time.Millisecond) // > re-kick interval
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("DrainForRoll did not exit after cancel")
	}
}

func TestDrainExplainMessageRoll(t *testing.T) {
	t.Parallel()
	msg := drainExplainMessage(drainSignal{Action: "roll", Via: "sigterm"}, "websocket-3")
	if !containsAll(msg, "websocket-3", "stopping", "sigterm") {
		t.Fatalf("explain message weak: %q", msg)
	}
}

func TestHandleWSRefuseDraining(t *testing.T) {
	t.Parallel()
	s := &Server{Clients: make(map[string]*Client)}
	s.draining.Store(true)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws?planner_session_id=tab-1", nil)
	s.HandleWS(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", rec.Code)
	}
	if body := rec.Body.String(); !stringContainsFold(body, "draining") {
		t.Fatalf("body=%q", body)
	}
}

func TestHandleWSRefuseCordoned(t *testing.T) {
	t.Setenv("OTEL_SERVICE_INSTANCE_ID", "websocket-drain-test")
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	key := wsplacement.CordonPrefix + instanceid.Replica()
	if err := rdb.Set(context.Background(), key, "1", 0).Err(); err != nil {
		t.Fatal(err)
	}

	s := &Server{
		Clients: make(map[string]*Client),
		Stack:   &stackservices.Clients{Redis: rdb},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws?planner_session_id=tab-1", nil)
	s.HandleWS(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", rec.Code)
	}
	if body := rec.Body.String(); !stringContainsFold(body, "cordoned") {
		t.Fatalf("body=%q", body)
	}
}

func TestHandleWSRefuseAtCutoff(t *testing.T) {
	t.Setenv("WS_SLOT_CLIENT_CUTOFF", "2")
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })

	s := &Server{
		Clients: map[string]*Client{
			"a": {id: "a"},
			"b": {id: "b"},
		},
		Stack: &stackservices.Clients{Redis: rdb},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws?planner_session_id=tab-1", nil)
	s.HandleWS(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503", rec.Code)
	}
	if body := rec.Body.String(); !stringContainsFold(body, "at_cutoff") {
		t.Fatalf("body=%q", body)
	}
}

func TestParseDrainSignal(t *testing.T) {
	t.Parallel()
	sig, ok := parseDrainSignal(`{"slot":"websocket-2","action":"evacuate","via":"ws-placement-ops"}`)
	if !ok || sig.Slot != "websocket-2" || sig.Action != "evacuate" || sig.Via != "ws-placement-ops" {
		t.Fatalf("json parse: %+v ok=%v", sig, ok)
	}
	sig, ok = parseDrainSignal("websocket-1")
	if !ok || sig.Slot != "websocket-1" || sig.Action != "unknown" || sig.Via != "bare_slot_publish" {
		t.Fatalf("bare slot parse: %+v ok=%v", sig, ok)
	}
	if _, ok := parseDrainSignal(""); ok {
		t.Fatal("empty should fail")
	}
	msg := drainExplainMessage(drainSignal{Action: "evacuate", Via: "ws-placement-ops"}, "websocket-2")
	if !containsAll(msg, "websocket-2", "evacuated", "ws-placement-ops") {
		t.Fatalf("explain message weak: %q", msg)
	}
}

func TestNormalizeDrainSignalDefaults(t *testing.T) {
	t.Parallel()
	got := normalizeDrainSignal(drainSignal{Slot: "  s  ", Action: "  ", Via: ""})
	if got.Slot != "s" || got.Action != "cordon" || got.Via != "ops" {
		t.Fatalf("%+v", got)
	}
}

func TestKickAndWaitStopsWhenKeepGoingFalse(t *testing.T) {
	t.Parallel()
	s := &Server{Clients: map[string]*Client{"stuck": {id: "stuck"}}}
	ctx := context.Background()
	started := time.Now()
	s.kickAndWait(ctx, func() drainSignal {
		return drainSignal{Action: "cordon", Via: "test"}
	}, "test kick", func() bool { return false })
	if time.Since(started) > time.Second {
		t.Fatal("keepGoing=false should exit without waiting on stuck client")
	}
	if s.ConnectedCount() != 1 {
		t.Fatalf("client remains until reader cleanup; count=%d", s.ConnectedCount())
	}
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

	ch := wsplacement.DrainChannel
	done := make(chan error, 1)
	go func() {
		done <- s.subscribeCordonDrain(ctx, rdb, ch, "websocket-2", trigger)
	}()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if mr.PubSubNumSub(ch)[ch] >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	payloadOther := `{"slot":"websocket-1","action":"evacuate","via":"ws-placement-ops"}`
	if err := rdb.Publish(ctx, ch, payloadOther).Err(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if hits.Load() != 0 {
		t.Fatalf("other slot should not trigger, hits=%d", hits.Load())
	}

	payloadOwn := `{"slot":"websocket-2","action":"evacuate","via":"ws-placement-ops"}`
	if err := rdb.Publish(ctx, ch, payloadOwn).Err(); err != nil {
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
	if err := rdb.Set(ctx, wsplacement.CordonPrefix+"websocket-9", "1", 0).Err(); err != nil {
		t.Fatal(err)
	}
	if !s.isOwnSlotCordoned(ctx) {
		t.Fatal("expected cordoned")
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
