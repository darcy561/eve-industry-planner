package nats

import (
	"testing"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry/natsprop"

	natslib "github.com/nats-io/nats.go"
)

// Request identity travels in one place: the message's headers. It used to be
// copied into the JSON body as well, and every consumer reconciled the two.
//
// This pins the round trip the publisher and consumer actually make — inject on
// the way out, bind on the way in — so a change that drops either half shows up
// here rather than as logs that quietly stop naming who caused the work.
func TestRequestIdentityRoundTripsThroughHeaders(t *testing.T) {
	t.Parallel()

	ctx := logs.WithRequestID(t.Context(), "rid-env")
	ctx = logs.BindRequestIdentity(ctx, "acct-env", "sess-env")

	hdr := make(natslib.Header)
	natsprop.InjectLogContext(ctx, hdr)

	got := natsprop.BindLogContextFromHeaders(t.Context(), hdr)

	if id := logs.RequestIDFromContext(got); id != "rid-env" {
		t.Errorf("request id = %q, want %q", id, "rid-env")
	}
	if id := logs.RequestAccountIDFromContext(got); id != "acct-env" {
		t.Errorf("account id = %q, want %q", id, "acct-env")
	}
	if id := logs.RequestSessionIDFromContext(got); id != "sess-env" {
		t.Errorf("session id = %q, want %q", id, "sess-env")
	}
}
