package server

import (
	"net/http"
	"testing"
)

// Service availability: /ready and /healthy via the same ReadyCheck shape as app.go.
func TestIntegrationReadyHealthyWhenDepsOK(t *testing.T) {
	f := newIntegFixture(t)

	status, body := f.get("/healthy")
	if status != http.StatusOK || body != "OK" {
		t.Fatalf("healthy status=%d body=%q", status, body)
	}
	status, body = f.get("/ready")
	if status != http.StatusOK || body != "OK" {
		t.Fatalf("ready status=%d body=%q", status, body)
	}
}

func TestIntegrationReadyFailsWhenDraining(t *testing.T) {
	f := newIntegFixture(t)
	f.Server.draining.Store(true)

	status, body := f.get("/ready")
	if status != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("ready status=%d body=%q", status, body)
	}
	// Liveness stays up during drain.
	status, body = f.get("/healthy")
	if status != http.StatusOK || body != "OK" {
		t.Fatalf("healthy status=%d body=%q", status, body)
	}
}

func TestIntegrationReadyFailsWhenRedisUnavailable(t *testing.T) {
	f := newIntegFixture(t)
	f.Redis = nil

	status, body := f.get("/ready")
	if status != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("ready status=%d body=%q", status, body)
	}
}

func TestIntegrationReadyFailsWhenNATSOrMongoFlaggedDown(t *testing.T) {
	f := newIntegFixture(t)

	f.setDeps(false, true)
	status, body := f.get("/ready")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("nats down: status=%d body=%q", status, body)
	}

	f.setDeps(true, false)
	status, body = f.get("/ready")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("mongo down: status=%d body=%q", status, body)
	}

	f.setDeps(true, true)
	status, body = f.get("/ready")
	if status != http.StatusOK {
		t.Fatalf("deps restored: status=%d body=%q", status, body)
	}
}
