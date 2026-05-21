package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/logs"
)

func TestRequestLoggingConstructor_ClientFailureDetail(t *testing.T) {
	handler := RequestLoggingConstructor()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logs.AttachClientFailureDetail(r, "planner refresh token not found in Redis", map[string]interface{}{
			"failure_class":    "auth_refresh_token_not_found",
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
