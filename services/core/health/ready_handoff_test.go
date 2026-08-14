package health

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/orchestrationprobes"
)

// #28 / start-first: Swarm /ready must pass for a standby (election loop + managed
// ack) without requiring IsLeader — otherwise hot-swap deadlocks.
func TestCheck_standbyHandoffWithoutLease(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	Register(Func{ComponentName: "deps", Fn: func(context.Context) error { return nil }})
	Register(Func{ComponentName: "primarycontroller", Fn: func(context.Context) error { return nil }})
	Register(Func{ComponentName: "scheduler", Fn: func(context.Context) error { return nil }})
	Register(Func{ComponentName: "changestream", Fn: func(context.Context) error { return nil }})

	if err := Check(context.Background()); err != nil {
		t.Fatalf("standby handoff Check: %v", err)
	}
}

func TestCheck_electionLoopDownFailsReady(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	Register(Func{ComponentName: "deps", Fn: func(context.Context) error { return nil }})
	Register(Func{
		ComponentName: "primarycontroller",
		Fn:            func(context.Context) error { return errors.New("election loop not running") },
	})

	if err := Check(context.Background()); err == nil {
		t.Fatal("expected Check error when election loop is down")
	}
}

func TestReadyHTTP_standbyMapsTo200(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	Register(Func{ComponentName: "deps", Fn: func(context.Context) error { return nil }})
	Register(Func{ComponentName: "primarycontroller", Fn: func(context.Context) error { return nil }})

	mux := http.NewServeMux()
	mux.HandleFunc("/ready", orchestrationprobes.ReadyHandler(Check))
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != http.StatusOK || string(body) != "OK" {
		t.Fatalf("standby /ready: %d %q", rec.Code, body)
	}
}

func TestReadyHTTP_notReadyMapsTo503(t *testing.T) {
	ResetForTest()
	t.Cleanup(ResetForTest)

	Register(Func{
		ComponentName: "primarycontroller",
		Fn:            func(context.Context) error { return errors.New("election loop not running") },
	})

	mux := http.NewServeMux()
	mux.HandleFunc("/ready", orchestrationprobes.ReadyHandler(Check))
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != http.StatusServiceUnavailable || string(body) != "NOT_READY" {
		t.Fatalf("broken /ready: %d %q", rec.Code, body)
	}
}
