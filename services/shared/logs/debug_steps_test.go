package logs

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAttachDebugStep(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("POST", "/api/v1/auth/sso/exchange", nil)
	start := time.Now().Add(-10 * time.Millisecond)
	ctx := WithHandlerFailureDetailStore(r.Context())
	ctx = context.WithValue(ctx, RequestStartTimeKey{}, start)
	r = r.WithContext(ctx)

	AttachDebugStep(r, "auth_code_received", map[string]any{"account_type": "character"})
	AttachDebugStepMsg(r, "claims_parsed", "parsed SSO access token claims", map[string]any{"character_hash": "abc"})

	steps := DebugStepsFromRequest(r)
	if len(steps) != 2 {
		t.Fatalf("steps = %d", len(steps))
	}
	if steps[0].Step != "auth_code_received" || steps[0].AtMS <= 0 {
		t.Fatalf("first step = %+v", steps[0])
	}
	if steps[1].Msg != "parsed SSO access token claims" {
		t.Fatalf("second step = %+v", steps[1])
	}
	formatted := DebugStepsForLog(steps)
	if formatted[0]["account_type"] != "character" {
		t.Fatalf("formatted = %v", formatted)
	}
}

func TestAttachDebugStep_MaxCap(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("GET", "/", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	r = r.WithContext(ctx)

	for i := range MaxDebugSteps + 5 {
		AttachDebugStep(r, "step", map[string]any{"i": i})
	}
	if len(DebugStepsFromRequest(r)) != MaxDebugSteps {
		t.Fatalf("expected cap at %d, got %d", MaxDebugSteps, len(DebugStepsFromRequest(r)))
	}
}

func TestAttachDebugStep_EnrichesBoundIdentity(t *testing.T) {
	t.Parallel()
	r := httptest.NewRequest("GET", "/api/v1/user/document", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	ctx = BindRequestIdentity(ctx, "acct-debug", "sess-debug")
	r = r.WithContext(ctx)

	AttachDebugStep(r, "mongo_query_completed", map[string]any{"found": true})

	steps := DebugStepsFromRequest(r)
	if len(steps) != 1 {
		t.Fatalf("steps = %d", len(steps))
	}
	formatted := DebugStepsForLog(steps)
	if formatted[0]["account_id"] != "acct-debug" || formatted[0]["session_id"] != "sess-debug" {
		t.Fatalf("formatted = %v", formatted[0])
	}
}

func TestAttachDebugStep_EnrichesIdentityFromResolver(t *testing.T) {
	t.Parallel()
	SetDebugIdentityResolver(func(ctx context.Context) (string, string) {
		return "acct-auth", "sess-auth"
	})
	t.Cleanup(func() { SetDebugIdentityResolver(nil) })

	r := httptest.NewRequest("GET", "/api/v1/example", nil)
	ctx := WithHandlerFailureDetailStore(r.Context())
	r = r.WithContext(ctx)

	AttachDebugStep(r, "lock_gate_passed", map[string]any{"doc_count": 3})

	formatted := DebugStepsForLog(DebugStepsFromRequest(r))
	if formatted[0]["account_id"] != "acct-auth" || formatted[0]["session_id"] != "sess-auth" {
		t.Fatalf("formatted = %v", formatted[0])
	}
}

func TestAttachDebugStep_SurvivesChildRequestContext(t *testing.T) {
	t.Parallel()
	outer := httptest.NewRequest("GET", "/", nil)
	ctx := WithHandlerFailureDetailStore(outer.Context())
	outer = outer.WithContext(ctx)

	inner := outer.WithContext(context.WithValue(outer.Context(), struct{ k string }{"x"}, "y"))
	AttachDebugStep(inner, "inner_step", nil)

	if len(DebugStepsFromRequest(outer)) != 1 {
		t.Fatal("expected debug step on outer request context")
	}
}
