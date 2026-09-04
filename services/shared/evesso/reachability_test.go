package evesso_test

import (
	"errors"
	"fmt"
	"testing"

	"eve-industry-planner/shared/evesso"
)

func TestServerAnsweredFollowsTheSameRuleAsTheLimiter(t *testing.T) {
	// The limiter counts any ESI status below 500 as the server answering. SSO
	// gets the same treatment, so a refused token clears the gate rather than
	// being silent about it.
	cases := []struct {
		name     string
		err      error
		answered bool
		why      string
	}{
		{
			name: "a refresh that worked", err: nil,
			answered: true, why: "the server answered",
		},
		{
			name: "a refused grant", err: errors.New("EVE SSO Error: invalid_grant: token is expired"),
			answered: true, why: "being turned away means something was there to turn you away",
		},
		{
			name: "a malformed request", err: errors.New("EVE SSO Error: invalid_request"),
			answered: true, why: "the server answered well enough to reject it",
		},
		{
			name: "a wrapped refusal", err: fmt.Errorf("rotating: %w", errors.New("invalid_grant")),
			answered: true, why: "wrapping must not turn a live server into an outage",
		},
		{
			name: "a transport failure", err: errors.New("dial tcp: connection refused"),
			answered: false, why: "nothing answered",
		},
		{
			name: "a server error", err: errors.New("EVE SSO Error: Server error (status 503)"),
			answered: false, why: "the server is there but not serving, which is what an outage looks like",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := evesso.ServerAnswered(tc.err); got != tc.answered {
				t.Errorf("ServerAnswered(%v) = %v, want %v — %s", tc.err, got, tc.answered, tc.why)
			}
		})
	}
}

func TestADeadTokenIsNotADeadServer(t *testing.T) {
	// The failure this rule exists to prevent: a nightly batch meeting a dozen
	// expired tokens must not read as CCP being down.
	batch := []error{
		errors.New("invalid_grant"), errors.New("invalid_grant"),
		errors.New("invalid_grant"), errors.New("invalid_grant"),
	}
	for i, err := range batch {
		if !evesso.ServerAnswered(err) {
			t.Fatalf("expired token %d reported the server as away", i)
		}
	}
}

func TestAPermanentFailureIsTheOneWorthDroppingARowFor(t *testing.T) {
	if !evesso.IsPermanentRefreshFailure(errors.New("invalid_grant")) {
		t.Error("a refused grant should be permanent; retrying it forever keeps a dead row alive")
	}
	if evesso.IsPermanentRefreshFailure(errors.New("dial tcp: connection refused")) {
		t.Error("a transport failure was treated as permanent, which would drop a live row during an outage")
	}
	if evesso.IsPermanentRefreshFailure(nil) {
		t.Error("success was treated as a permanent failure")
	}
}
