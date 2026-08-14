package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/logs"
)

func TestRequestLoggingConstructor_ClientFailureDetail(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logs.AttachClientFailureDetail(r, "planner refresh token not found in Redis", map[string]any{
			"failure_class":     "auth_refresh_token_not_found",
			"credential_source": "json_body",
		})
		http.Error(w, "Invalid token", http.StatusUnauthorized)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sessions/rotate", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequestLoggingConstructor_SuccessWithDebugSteps(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logs.AttachDebugStep(r, "claims_parsed", map[string]any{"character_hash": "abc"})
		logs.AttachHandlerSuccessDetail(r, "SSO token exchange completed", map[string]any{
			"duration_ms": int64(12),
		})
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/sso/exchange", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequestLoggingConstructor_SuccessWithCaveats(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logs.AttachHandlerCaveat(r, "mongo_write_count_mismatch", "mongo write count differs from batch size", map[string]any{
			"jobs": 10, "saved_ops": 8,
		})
		logs.AttachHandlerSuccessDetail(r, "archived jobs put done", map[string]any{
			"jobs": 10, "saved_ops": 8,
		})
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodPut, "/api/v1/archived-jobs", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequestLoggingConstructor_HealthSkipsAccessLog(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logs.AttachDebugStep(r, "health_check", nil)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequestLoggingConstructor_BareSuccessEmitsNoAccessLog(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/example", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRequestLoggingConstructor_ResolvesIdentityFromSuccessDetail(t *testing.T) {
	var loggedRequest *http.Request
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		loggedRequest = r
		inner := r.WithContext(logs.BindRequestIdentity(r.Context(), "acct-log", "sess-log"))
		logs.AttachHandlerSuccessDetail(inner, "user document retrieved", map[string]any{
			"found": false,
		})
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/user/document", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	accountID, sessionID := logs.RequestIdentityFromRequest(loggedRequest)
	if accountID != "acct-log" || sessionID != "sess-log" {
		t.Fatalf("identity = %q %q", accountID, sessionID)
	}
}
