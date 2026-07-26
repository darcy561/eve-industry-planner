package tests

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eve-industry-planner/api/helper/sdecache"
	"eve-industry-planner/shared/orchestrationprobes"
)

func apiProbeMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthy", orchestrationprobes.HealthyHandler)
	mux.HandleFunc("/health", orchestrationprobes.HealthyHandler)
	mux.HandleFunc("/ready", orchestrationprobes.ReadyHandler(func(context.Context) error {
		if !sdecache.IsReady() {
			return fmt.Errorf("sde cache not ready")
		}
		return nil
	}))
	return mux
}

func probe(t *testing.T, path string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	apiProbeMux().ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	return rec.Code, string(body)
}

func TestReadyHandler_notReadyUntilWarm(t *testing.T) {
	sdecache.ResetForTest()
	t.Cleanup(sdecache.ResetForTest)

	code, body := probe(t, "/ready")
	if code != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("status=%d body=%q", code, body)
	}
}

func TestHealthyHandler_alwaysOK(t *testing.T) {
	code, body := probe(t, "/healthy")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("status=%d body=%q", code, body)
	}
}

// TestProbes_livenessVsReadinessDocumentsSDEContract locks the Swarm-facing contract:
//   - /healthy (and /health) must stay 200 while SDE is missing so a container
//     is not killed during cold start / object-store lag.
//   - /ready must stay 503 until the cache is warm so Traefik does not send traffic.
func TestProbes_livenessVsReadinessDocumentsSDEContract(t *testing.T) {
	sdecache.ResetForTest()
	t.Cleanup(sdecache.ResetForTest)

	deadline := time.Now().Add(2 * time.Second)
	for i := 0; time.Now().Before(deadline); i++ {
		code, body := probe(t, "/healthy")
		if code != http.StatusOK || body != "OK" {
			t.Fatalf("poll %d: /healthy=%d %q (liveness must not depend on SDE)", i, code, body)
		}
		code, body = probe(t, "/health")
		if code != http.StatusOK || body != "OK" {
			t.Fatalf("poll %d: /health=%d %q (alias must match liveness)", i, code, body)
		}
		code, body = probe(t, "/ready")
		if code != http.StatusServiceUnavailable || body != "NOT_READY" {
			t.Fatalf("poll %d: /ready=%d %q (want 503 NOT_READY before warm)", i, code, body)
		}
		time.Sleep(20 * time.Millisecond)
	}

	sdecache.SetReadyForTest(true)
	code, body := probe(t, "/healthy")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("after warm /healthy=%d %q", code, body)
	}
	code, body = probe(t, "/ready")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("after warm /ready=%d %q", code, body)
	}
}

func TestHealthyIndependentOfReadyFlip(t *testing.T) {
	sdecache.ResetForTest()
	t.Cleanup(sdecache.ResetForTest)

	code, body := probe(t, "/healthy")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("/healthy while not ready: %d %q", code, body)
	}

	sdecache.SetReadyForTest(true)
	code, body = probe(t, "/healthy")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("/healthy while ready: %d %q", code, body)
	}

	sdecache.SetReadyForTest(false)
	code, body = probe(t, "/ready")
	if code != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("/ready while not ready: %d %q", code, body)
	}
	code, _ = probe(t, "/healthy")
	if code != http.StatusOK {
		t.Fatalf("/healthy must stay OK when ready flips false: %d", code)
	}
}
