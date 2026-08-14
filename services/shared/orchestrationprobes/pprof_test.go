package orchestrationprobes

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPprofEnabledEnv(t *testing.T) {
	t.Setenv("ENVIRONMENT", "development")
	if !pprofEnabled() {
		t.Fatal("development should enable")
	}
	t.Setenv("ENVIRONMENT", "production")
	if pprofEnabled() {
		t.Fatal("production should disable")
	}
	t.Setenv("ENVIRONMENT", "")
	if pprofEnabled() {
		t.Fatal("empty ENVIRONMENT should disable")
	}
}

func TestRegisterPprofMountsHeap(t *testing.T) {
	t.Setenv("ENVIRONMENT", "development")
	mux := http.NewServeMux()
	registerPprof(mux)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/heap?debug=1", nil)
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestRegisterPprofSkippedWhenOff(t *testing.T) {
	t.Setenv("ENVIRONMENT", "production")
	mux := http.NewServeMux()
	registerPprof(mux)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 when disabled, got %d", rec.Code)
	}
}
