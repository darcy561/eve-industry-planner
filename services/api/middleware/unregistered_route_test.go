package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eve-industry-planner/shared/logs"
)

func TestWrapServeMuxUnregisteredRoutes_UnregisteredPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/auth/sessions/rotate", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
	rec := httptest.NewRecorder()
	WrapServeMuxUnregisteredRoutes(mux).ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if body := strings.TrimSpace(rec.Body.String()); body != "404 page not found" {
		t.Fatalf("body = %q, want generic not found", body)
	}

	det := logs.HandlerFailureDetailFromRequest(req)
	if det == nil {
		t.Fatal("expected handler_failure detail on request")
	}
	if det["failure_class"] != "api_route_not_found" {
		t.Fatalf("failure_class = %v", det["failure_class"])
	}
	if det["path"] != "/api/v1/auth/refresh" {
		t.Fatalf("path = %v", det["path"])
	}
	if det[logs.ClientFailureMsgKey] != "no API route registered for POST /api/v1/auth/refresh" {
		t.Fatalf("client_failure_msg = %v", det[logs.ClientFailureMsgKey])
	}
}

func TestWrapServeMuxUnregisteredRoutes_RegisteredPath(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/auth/sessions/rotate", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sessions/rotate", nil)
	rec := httptest.NewRecorder()
	WrapServeMuxUnregisteredRoutes(mux).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
