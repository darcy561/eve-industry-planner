package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/redisfake"
	"eve-industry-planner/testing/wait"
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

	wait.For(t, 2*time.Second, func() (bool, string) {
		return s.IsDraining(), "drain did not start"
	})

	s.ClientsMu.Lock()
	s.Clients["late"] = &Client{id: "late"}
	s.ClientsMu.Unlock()

	time.Sleep(400 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("DrainForRoll did not exit after cancel")
	}
}

func TestDrainExplainMessageRoll(t *testing.T) {
	t.Parallel()
	msg := drainExplainMessage(drainSignal{Action: "roll", Via: "sigterm"}, "ccc333333333")
	if !containsAll(msg, "ccc333333333", "stopping", "sigterm") {
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

func TestHandleWSRefuseAtCutoff(t *testing.T) {
	t.Setenv("WS_CLIENT_CUTOFF", "2")
	rdb := redisfake.New(t).Client

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

func TestNormalizeDrainSignalDefaults(t *testing.T) {
	t.Parallel()
	got := normalizeDrainSignal(drainSignal{ContainerID: "  s  ", Action: "  ", Via: ""})
	if got.ContainerID != "s" || got.Action != "roll" || got.Via != "sigterm" {
		t.Fatalf("%+v", got)
	}
}

func TestKickAndWaitStopsWhenKeepGoingFalse(t *testing.T) {
	t.Parallel()
	s := &Server{Clients: map[string]*Client{"stuck": {id: "stuck"}}}
	ctx := context.Background()
	started := time.Now()
	s.kickAndWait(ctx, func() drainSignal {
		return drainSignal{Action: "roll", Via: "test"}
	}, "test kick", func() bool { return false })
	if time.Since(started) > time.Second {
		t.Fatal("keepGoing=false should exit without waiting on stuck client")
	}
	if s.ConnectedCount() != 1 {
		t.Fatalf("client remains until reader cleanup; count=%d", s.ConnectedCount())
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
