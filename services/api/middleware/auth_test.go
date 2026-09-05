package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/testing/redisfake"
)

func TestAuthConstructor_AttachesClientFailureDetail(t *testing.T) {
	t.Parallel()

	rdb := redisfake.New(t).Client

	handler := AuthConstructor(rdb)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not run when auth fails")
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/corporation-claims", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}
	det := logs.HandlerFailureDetailFromRequest(req)
	if det[logs.ClientFailureMsgKey] != "auth session missing or invalid" {
		t.Fatalf("client_failure_msg = %v", det[logs.ClientFailureMsgKey])
	}
	if det["failure_class"] != "auth_session_missing" {
		t.Fatalf("failure_class = %v", det["failure_class"])
	}
	if det["reason"] != "session_absent" {
		t.Fatalf("reason = %v", det["reason"])
	}
}
