package logs

import (
	"context"
	"net/http/httptest"
	"testing"
)

func TestAttachHandlerSuccessDetailAndCaveats(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("PUT", "/api/v1/archived-jobs", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	r = r.WithContext(ctx)

	AttachHandlerCaveat(r, "mongo_write_count_mismatch", "mongo write count differs from batch size", map[string]any{
		"jobs":      10,
		"saved_ops": 8,
	})
	AttachHandlerSuccessDetail(r, "archived jobs put done", map[string]any{
		"jobs":        10,
		"saved_ops":   8,
		"duration_ms": int64(42),
	})

	msg, detail, caveats := HandlerSuccessFromRequest(r)
	if msg != "archived jobs put done" {
		t.Fatalf("msg = %q", msg)
	}
	if detail["jobs"] != 10 || detail["saved_ops"] != 8 {
		t.Fatalf("detail = %v", detail)
	}
	if len(caveats) != 1 || caveats[0].Key != "mongo_write_count_mismatch" {
		t.Fatalf("caveats = %v", caveats)
	}
	if SuccessAccessLogMessage(msg, caveats) != "archived jobs put done" {
		t.Fatalf("SuccessAccessLogMessage with caveats should prefer handler msg")
	}
	formatted := HandlerCaveatsForLog(caveats)
	if formatted[0]["jobs"] != 10 {
		t.Fatalf("formatted caveats = %v", formatted)
	}
}

func TestAttachHandlerSuccessDetail_SurvivesChildRequestContext(t *testing.T) {
	t.Parallel()
	outer := httptest.NewRequest("PUT", "/api/v1/archived-jobs", nil)
	ctx := WithHandlerFailureDetailStore(outer.Context())
	outer = outer.WithContext(ctx)

	inner := outer.WithContext(context.WithValue(outer.Context(), struct{ k string }{"marker"}, "child"))
	AttachHandlerSuccessDetail(inner, "archived jobs put done", map[string]any{"jobs": 3})

	msg, detail, _ := HandlerSuccessFromRequest(outer)
	if msg != "archived jobs put done" || detail["jobs"] != 3 {
		t.Fatalf("outer success = %q %v", msg, detail)
	}
}

func TestSuccessAccessLogMessage_Defaults(t *testing.T) {
	t.Parallel()
	if SuccessAccessLogMessage("", nil) != "request completed" {
		t.Fatal("expected default success message")
	}
	if SuccessAccessLogMessage("", []HandlerCaveat{{Key: "x", Msg: "y"}}) != "request completed with caveats" {
		t.Fatal("expected caveat default message")
	}
}
