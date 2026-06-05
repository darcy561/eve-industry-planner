package natsprop

import (
	"context"
	"testing"

	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
)

func TestLogContextInjectExtractRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := logs.WithRequestID(context.Background(), "req-1")
	ctx = logs.BindRequestIdentity(ctx, "acct-1", "sess-1")

	hdr := make(natslib.Header)
	InjectLogContext(ctx, hdr)

	got := context.Background()
	got = BindLogContextFromHeaders(got, hdr)

	if logs.RequestIDFromContext(got) != "req-1" {
		t.Fatalf("request_id = %q", logs.RequestIDFromContext(got))
	}
	if logs.RequestAccountIDFromContext(got) != "acct-1" {
		t.Fatalf("account_id = %q", logs.RequestAccountIDFromContext(got))
	}
	if logs.RequestSessionIDFromContext(got) != "sess-1" {
		t.Fatalf("session_id = %q", logs.RequestSessionIDFromContext(got))
	}
}

func TestMergeLogContextIntoHeaders_DoesNotOverwrite(t *testing.T) {
	t.Parallel()
	headers := map[string]string{HeaderRequestID: "existing"}
	merged := MergeLogContextIntoHeaders(headers, "new", "acct", "sess")
	if merged[HeaderRequestID] != "existing" {
		t.Fatalf("request_id overwritten: %q", merged[HeaderRequestID])
	}
	if merged[HeaderLogAccountID] != "acct" {
		t.Fatalf("account_id = %q", merged[HeaderLogAccountID])
	}
}

func TestBindLogContextFromStringMap(t *testing.T) {
	t.Parallel()
	m := map[string]string{
		HeaderRequestID:    "r2",
		HeaderLogAccountID: "a2",
	}
	ctx := BindLogContextFromStringMap(context.Background(), m)
	if logs.RequestIDFromContext(ctx) != "r2" || logs.RequestAccountIDFromContext(ctx) != "a2" {
		t.Fatalf("identity not bound")
	}
}

func TestBindLogContext_DoesNotOverwriteExisting(t *testing.T) {
	t.Parallel()
	ctx := logs.WithRequestID(context.Background(), "keep")
	ctx = BindLogContext(ctx, "replace", "", "")
	if logs.RequestIDFromContext(ctx) != "keep" {
		t.Fatalf("request_id overwritten")
	}
}
