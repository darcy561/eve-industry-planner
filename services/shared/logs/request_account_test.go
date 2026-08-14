package logs

import (
	"context"
	"net/http/httptest"
	"testing"
)

func TestBindRequestIdentity_EnrichesHandlerFailureDetail(t *testing.T) {
	t.Parallel()

	r := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	ctx = BindRequestIdentity(ctx, "acct-1", "sess-1")
	r = r.WithContext(ctx)

	AttachClientFailureDetail(r, "user document not found", map[string]any{
		"failure_class": "user_doc_not_found",
	})

	det := HandlerFailureDetailFromRequest(r)
	if det["account_id"] != "acct-1" {
		t.Fatalf("account_id = %v", det["account_id"])
	}
	if det["session_id"] != "sess-1" {
		t.Fatalf("session_id = %v", det["session_id"])
	}
}

func TestBindRequestIdentity_ExplicitDetailWins(t *testing.T) {
	t.Parallel()

	r := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	ctx = BindRequestIdentity(ctx, "acct-ctx", "sess-ctx")
	r = r.WithContext(ctx)

	AttachClientFailureDetail(r, "mismatch", map[string]any{
		"failure_class": "auth_account_mismatch",
		"account_id":    "acct-explicit",
		"session_id":    "sess-explicit",
	})

	det := HandlerFailureDetailFromRequest(r)
	if det["account_id"] != "acct-explicit" {
		t.Fatalf("account_id = %v", det["account_id"])
	}
	if det["session_id"] != "sess-explicit" {
		t.Fatalf("session_id = %v", det["session_id"])
	}
}

func TestInfoCtx_IncludesBoundRequestIdentity(t *testing.T) {
	t.Parallel()

	ctx := BindRequestIdentity(context.Background(), "acct-info", "sess-info")
	InfoCtx(ctx, "test message", "key", "value")
}

func TestRequestIdentityFromRequest_FromContext(t *testing.T) {
	t.Parallel()

	r := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	r = r.WithContext(BindRequestIdentity(r.Context(), "acct-ctx", "sess-ctx"))

	accountID, sessionID := RequestIdentityFromRequest(r)
	if accountID != "acct-ctx" || sessionID != "sess-ctx" {
		t.Fatalf("identity = %q %q", accountID, sessionID)
	}
}

func TestRequestIdentityFromRequest_FromSuccessDetailWhenOuterContextMissing(t *testing.T) {
	t.Parallel()

	outer := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	ctx := WithHandlerFailureDetailStore(outer.Context())
	outer = outer.WithContext(ctx)

	inner := outer.WithContext(BindRequestIdentity(outer.Context(), "acct-store", "sess-store"))
	AttachHandlerSuccessDetail(inner, "user document retrieved", map[string]any{
		"found": false,
	})

	accountID, sessionID := RequestIdentityFromRequest(outer)
	if accountID != "acct-store" || sessionID != "sess-store" {
		t.Fatalf("identity = %q %q", accountID, sessionID)
	}
}

func TestRequestIdentityFromRequest_FromFailureDetail(t *testing.T) {
	t.Parallel()

	r := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	r = r.WithContext(ctx)

	AttachClientFailureDetail(r, "user document not found", map[string]any{
		"failure_class": "user_doc_not_found",
		"account_id":    "acct-fail",
		"session_id":    "sess-fail",
	})

	accountID, sessionID := RequestIdentityFromRequest(r)
	if accountID != "acct-fail" || sessionID != "sess-fail" {
		t.Fatalf("identity = %q %q", accountID, sessionID)
	}
}
