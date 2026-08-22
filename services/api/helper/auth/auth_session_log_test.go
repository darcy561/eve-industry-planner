package auth

import (
	"context"
	"errors"
	"testing"
)

func TestAuthSessionFailureDetail_ClientFailureDetail(t *testing.T) {
	t.Parallel()

	detail := AuthSessionFailureDetail{
		Code:                "session_missing",
		AccountID:           "acct-1",
		SessionID:           "sess-1",
		HasEipSessionCookie: true,
		Reason:              authSessionReasonSessionRowMissing,
	}
	if detail.ClientFailureMessage() != "auth session missing or invalid" {
		t.Fatalf("message = %q", detail.ClientFailureMessage())
	}
	fields := detail.ClientFailureDetail(nil)
	if fields["failure_class"] != "auth_session_missing" {
		t.Fatalf("failure_class = %v", fields["failure_class"])
	}
	if fields["account_id"] != "acct-1" || fields["session_id"] != "sess-1" {
		t.Fatalf("account/session = %v / %v", fields["account_id"], fields["session_id"])
	}
	if fields["reason"] != authSessionReasonSessionRowMissing {
		t.Fatalf("reason = %v", fields["reason"])
	}
}

func TestAuthSessionFailureDetailFromError(t *testing.T) {
	t.Parallel()

	req := newSessionCookieRequest("sess-log-test")
	detail := AuthSessionFailureDetailFromError(&AuthSessionError{
		Code:      "session_missing",
		AccountID: "acct-1",
		SessionID: "sess-log-test",
		Reason:    authSessionReasonSessionRowMissing,
	}, req)
	if detail.Code != "session_missing" {
		t.Fatalf("code = %q", detail.Code)
	}
	if detail.AccountID != "acct-1" || detail.SessionID != "sess-log-test" {
		t.Fatalf("account/session = %q / %q", detail.AccountID, detail.SessionID)
	}
	if detail.Reason != authSessionReasonSessionRowMissing {
		t.Fatalf("reason = %q", detail.Reason)
	}
	if !detail.HasEipSessionCookie {
		t.Fatal("expected session cookie detected")
	}

	fields := detail.LogFields()
	if !containsLogField(fields, "account_id", "acct-1") {
		t.Fatalf("missing account_id in fields: %v", fields)
	}
	if !containsLogField(fields, "session_id", "sess-log-test") {
		t.Fatalf("missing session_id in fields: %v", fields)
	}
	if !containsLogField(fields, "reason", authSessionReasonSessionRowMissing) {
		t.Fatalf("missing reason in fields: %v", fields)
	}
}

func TestExtractAccountSession_MissingCookieIncludesReason(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)
	req := newSessionCookieRequest("")
	_, err := ExtractAccountSession(ctx, req, rdb)
	if err == nil {
		t.Fatal("expected error")
	}
	var authErr *AuthSessionError
	if !errors.As(err, &authErr) {
		t.Fatalf("expected AuthSessionError, got %T: %v", err, err)
	}
	if authErr.Code != "session_missing" || authErr.Reason != authSessionReasonSessionAbsent {
		t.Fatalf("unexpected auth error: %+v", authErr)
	}
	if authErr.SessionID != "" || authErr.AccountID != "" {
		t.Fatalf("expected empty ids, got account=%q session=%q", authErr.AccountID, authErr.SessionID)
	}
}

func TestExtractAccountSession_OrphanIndexIncludesAccountAndSession(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	rdb, _ := newAuthTestRedis(t)

	const (
		accountID = "acct-extract-orphan-detail"
		sessionID = "sess-extract-orphan-detail"
	)
	rec := &AccountSessionsRecord{
		AccountID: accountID,
		Grants: SessionGrants{
			CorporationRefs: []string{},
			AllianceRefs:    []string{},
		},
		Sessions: map[string]AccountSession{},
	}
	if err := SaveAccountSessionsRecord(ctx, rdb, rec); err != nil {
		t.Fatalf("SaveAccountSessionsRecord: %v", err)
	}
	if err := rdb.Set(ctx, sessionIndexKey(sessionID), accountID, SessionTTL).Err(); err != nil {
		t.Fatalf("set session index: %v", err)
	}

	req := newSessionCookieRequest(sessionID)
	_, err := ExtractAccountSession(ctx, req, rdb)
	if err == nil {
		t.Fatal("expected error")
	}
	var authErr *AuthSessionError
	if !errors.As(err, &authErr) {
		t.Fatalf("expected AuthSessionError, got %T: %v", err, err)
	}
	if authErr.Code != "session_missing" {
		t.Fatalf("code = %q", authErr.Code)
	}
	if authErr.AccountID != accountID || authErr.SessionID != sessionID {
		t.Fatalf("account/session = %q / %q", authErr.AccountID, authErr.SessionID)
	}
	if authErr.Reason != authSessionReasonSessionRowMissing {
		t.Fatalf("reason = %q", authErr.Reason)
	}
}

func containsLogField(fields []any, key string, want any) bool {
	for i := 0; i+1 < len(fields); i += 2 {
		if k, ok := fields[i].(string); ok && k == key && fields[i+1] == want {
			return true
		}
	}
	return false
}
