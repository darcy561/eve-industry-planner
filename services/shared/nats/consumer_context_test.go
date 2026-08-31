package nats

import (
	"context"
	"testing"

	"eve-industry-planner/shared/logs"
)

func TestMessageEnrichLogContextFromContext(t *testing.T) {
	t.Parallel()
	ctx := logs.WithRequestID(context.Background(), "rid-env")
	ctx = logs.BindRequestIdentity(ctx, "acct-env", "sess-env")

	var msg Message
	msg.EnrichLogContextFromContext(ctx)
	if msg.LogContext == nil || msg.LogContext.RequestID != "rid-env" {
		t.Fatalf("log_context = %+v", msg.LogContext)
	}
	if msg.LogContext.AccountID != "acct-env" || msg.LogContext.SessionID != "sess-env" {
		t.Fatalf("identity = %+v", msg.LogContext)
	}
}
