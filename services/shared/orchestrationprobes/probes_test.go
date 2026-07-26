package orchestrationprobes

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func serve(t *testing.T, ready ReadyCheck, registerExtra func(*http.ServeMux), method, path string) (int, string) {
	t.Helper()
	mux := http.NewServeMux()
	mountDefaults(mux, ready, registerExtra)
	req := httptest.NewRequest(method, path, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	return rec.Code, string(body)
}

func TestHealthyAlwaysOK(t *testing.T) {
	for _, path := range []string{"/healthy", "/health"} {
		code, body := serve(t, nil, nil, http.MethodGet, path)
		if code != http.StatusOK || body != "OK" {
			t.Fatalf("%s: %d %q", path, code, body)
		}
	}
}

func TestReadyNilCheckNotReady(t *testing.T) {
	code, body := serve(t, nil, nil, http.MethodGet, "/ready")
	if code != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("got %d %q", code, body)
	}
}

func TestReadyCheckErrorAndOK(t *testing.T) {
	code, body := serve(t, func(context.Context) error {
		return errors.New("cold")
	}, nil, http.MethodGet, "/ready")
	if code != http.StatusServiceUnavailable || body != "NOT_READY" {
		t.Fatalf("cold: %d %q", code, body)
	}

	code, body = serve(t, func(context.Context) error { return nil }, nil, http.MethodGet, "/ready")
	if code != http.StatusOK || body != "OK" {
		t.Fatalf("warm: %d %q", code, body)
	}
}

func TestRegisterExtra(t *testing.T) {
	code, body := serve(t, func(context.Context) error { return nil }, func(mux *http.ServeMux) {
		mux.HandleFunc("/orchestration/ping", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("pong"))
		})
	}, http.MethodGet, "/orchestration/ping")
	if code != http.StatusOK || body != "pong" {
		t.Fatalf("extra: %d %q", code, body)
	}
}

func TestListenAddrFixed(t *testing.T) {
	if ListenAddr != ":19100" || ListenPort != "19100" {
		t.Fatalf("ListenAddr=%q ListenPort=%q", ListenAddr, ListenPort)
	}
	if ListenAddr != ":"+ListenPort {
		t.Fatalf("ListenAddr must be ':'+ListenPort")
	}
}
