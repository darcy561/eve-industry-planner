package logs

import (
	"context"
	"testing"
	"time"
)

func TestBeginOperationContext_DebugStepsAndCaveats(t *testing.T) {
	t.Parallel()
	parent := BindRequestIdentity(context.Background(), "acct-ws", "sess-ws")
	ctx := BeginOperationContext(parent)

	AttachDebugStepCtx(ctx, "message_received", map[string]any{"message_type": "document_lock_viewer_arrived"})
	AttachHandlerCaveatCtx(ctx, "ack_buffer_full", "ack not delivered", map[string]any{"request_id": "r1"})

	steps := DebugStepsFromContext(ctx)
	if len(steps) != 1 || steps[0].Step != "message_received" {
		t.Fatalf("steps = %+v", steps)
	}
	if steps[0].AtMS < 0 {
		t.Fatalf("expected non-negative at_ms, got %d", steps[0].AtMS)
	}
	formatted := DebugStepsForLog(steps)
	if formatted[0]["account_id"] != "acct-ws" || formatted[0]["session_id"] != "sess-ws" {
		t.Fatalf("formatted = %v", formatted[0])
	}

	caveats := HandlerCaveatsFromContext(ctx)
	if len(caveats) != 1 || caveats[0].Key != "ack_buffer_full" {
		t.Fatalf("caveats = %+v", caveats)
	}

	start, ok := RequestStartTime(ctx)
	if !ok || time.Since(start) < 0 {
		t.Fatalf("start time missing")
	}
}

func TestBeginOperationContext_PreservesExistingStartTime(t *testing.T) {
	t.Parallel()
	start := time.Now().Add(-50 * time.Millisecond)
	parent := context.WithValue(context.Background(), RequestStartTimeKey{}, start)
	ctx := BeginOperationContext(parent)
	got, ok := RequestStartTime(ctx)
	if !ok || !got.Equal(start) {
		t.Fatalf("start = %v ok=%v", got, ok)
	}
}

func TestBeginIsolatedOperationContext_FreshStoreAndStartTime(t *testing.T) {
	t.Parallel()
	upgradeStart := time.Now().Add(-2 * time.Minute)
	parent := WithHandlerFailureDetailStore(context.Background())
	parent = context.WithValue(parent, RequestStartTimeKey{}, upgradeStart)
	AttachDebugStepCtx(parent, "request_started", nil)
	AttachDebugStepCtx(parent, "websocket_upgrade_completed", nil)

	ctx := BeginIsolatedOperationContext(parent)
	AttachDebugStepCtx(ctx, "message_received", map[string]any{"message_type": "document_lock_lock_state_batch"})

	steps := DebugStepsFromContext(ctx)
	if len(steps) != 1 || steps[0].Step != "message_received" {
		t.Fatalf("isolated steps = %+v", steps)
	}
	parentSteps := DebugStepsFromContext(parent)
	if len(parentSteps) != 2 {
		t.Fatalf("parent steps = %+v", parentSteps)
	}
	start, ok := RequestStartTime(ctx)
	if !ok || !start.After(upgradeStart) {
		t.Fatalf("isolated start = %v upgradeStart = %v ok=%v", start, upgradeStart, ok)
	}
	if steps[0].AtMS > 500 {
		t.Fatalf("expected small at_ms for new operation, got %d", steps[0].AtMS)
	}
}
