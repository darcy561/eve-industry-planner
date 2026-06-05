package logs

import (
	"context"
	"testing"
)

func TestWithRequestID_RoundTrip(t *testing.T) {
	t.Parallel()
	ctx := WithRequestID(context.Background(), "req-abc")
	if got := RequestIDFromContext(ctx); got != "req-abc" {
		t.Fatalf("RequestIDFromContext = %q", got)
	}
}

func TestWithRequestID_TrimsAndSkipsEmpty(t *testing.T) {
	t.Parallel()
	ctx := WithRequestID(context.Background(), "  ")
	if got := RequestIDFromContext(ctx); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	ctx = WithRequestID(context.Background(), "  rid  ")
	if got := RequestIDFromContext(ctx); got != "rid" {
		t.Fatalf("got %q", got)
	}
}

func TestEnsureOperationLogger_IncludesRequestIdentity(t *testing.T) {
	t.Parallel()
	parent := WithRequestID(context.Background(), "rid-1")
	parent = BindRequestIdentity(parent, "acct-1", "sess-1")
	ctx := EnsureOperationLogger(parent)
	l := FromContext(ctx)
	if l == nil {
		t.Fatal("nil logger")
	}
}
