package logs

import (
	"errors"
	"net/http/httptest"
	"testing"
)

func TestAttachClientFailureDetail(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("POST", "/api/v1/auth/sessions/rotate", nil)
	AttachClientFailureDetail(r, "planner refresh token not found in Redis", map[string]interface{}{
		"failure_class": "auth_refresh_token_not_found",
		"likely_cause":  "stale_or_revoked_body_refresh_token_typical_multi_tab_or_local_account",
	})
	det := HandlerFailureDetailFromRequest(r)
	if det["client_failure_msg"] != "planner refresh token not found in Redis" {
		t.Fatalf("client_failure_msg = %v", det["client_failure_msg"])
	}
	if det["failure_class"] != "auth_refresh_token_not_found" {
		t.Fatalf("failure_class = %v", det["failure_class"])
	}
	msg := ClientAccessLogMessage(401, det)
	if msg != "planner refresh token not found in Redis" {
		t.Fatalf("ClientAccessLogMessage = %q", msg)
	}
}

func TestClientAccessLogMessage_FailureClassFallback(t *testing.T) {
	t.Parallel()
	msg := ClientAccessLogMessage(401, map[string]interface{}{"failure_class": "auth_reauth_required"})
	if msg != "request completed with client error (auth_reauth_required)" {
		t.Fatalf("message = %q", msg)
	}
}

func TestAttachServerFailureDetail(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("POST", "/api/v1/auth/sessions/rotate", nil)
	err := errors.New("redis timeout")
	AttachServerFailureDetail(r, "failed to store new refresh token", err, map[string]interface{}{
		"failure_class": "auth_redis_store_refresh",
		"metric":        "session_refresh",
	})
	det := HandlerFailureDetailFromRequest(r)
	if det[ServerFailureMsgKey] != "failed to store new refresh token" {
		t.Fatalf("server_failure_msg = %v", det[ServerFailureMsgKey])
	}
	if HandlerErrorFromRequest(r) != err {
		t.Fatal("expected attached handler error")
	}
	msg := AccessLogMessage(500, det)
	if msg != "failed to store new refresh token" {
		t.Fatalf("AccessLogMessage = %q", msg)
	}
}
