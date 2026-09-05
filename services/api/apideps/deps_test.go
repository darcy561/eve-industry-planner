package apideps_test

import (
	"errors"
	"testing"

	"eve-industry-planner/api/apideps"
	"eve-industry-planner/shared/stackservices"
	"eve-industry-planner/testing/esifake"
)

func TestDepsCarryTheLimiter(t *testing.T) {
	esi := esifake.New(t)

	deps := apideps.FromClients(&stackservices.Clients{}, nil, esi)
	if deps.ESI == nil {
		t.Fatal("handlers cannot reach the limiter, so nothing can report an outage")
	}

	// A handler asks the embedded Deps rather than being handed a connection, so
	// the client has to survive the mapping, not just be passed to it.
	if _, err := deps.ESI.Availability(t.Context()); err != nil {
		t.Errorf("Availability through Deps: %v", err)
	}
}

func TestTheLimiterSurvivesAnAbsentConnectBag(t *testing.T) {
	// Mongo-only wiring passes no connect bag. The limiter is not one of its
	// handles, so it must not be dropped with them.
	esi := esifake.New(t)

	deps := apideps.FromClients(nil, nil, esi)
	if deps.ESI == nil {
		t.Error("the limiter was dropped along with the absent connect bag")
	}
}

func TestDepsWithoutALimiterAreUsable(t *testing.T) {
	// Tests and mongo-only wiring supply none, so a nil is a state handlers must
	// check rather than a startup failure.
	deps := apideps.FromClients(&stackservices.Clients{}, nil, nil)
	if deps == nil {
		t.Fatal("FromClients returned nil")
	}
	if deps.ESI != nil {
		t.Error("an ESI client appeared from nowhere")
	}
}

func TestReportSSOTellsTheLimiterWhetherTheServerAnswered(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		answered bool
		why      string
	}{
		{
			name: "a refresh that worked", err: nil,
			answered: true, why: "reaching SSO is evidence the servers are up",
		},
		{
			name: "the token was refused", err: errors.New("EVE SSO Error: invalid_grant: expired"),
			answered: true, why: "the server answered; a batch of dead tokens must not read as an outage",
		},
		{
			name: "nothing answered", err: errors.New("dial tcp: connection refused"),
			answered: false, why: "this is the second source the fleet needs to conclude an outage",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			esi := esifake.New(t)
			deps := apideps.FromClients(&stackservices.Clients{}, nil, esi)

			deps.ReportSSO(t.Context(), tc.err)

			got := esi.Observations()
			if len(got) != 1 {
				t.Fatalf("made %d observations, want exactly 1 — %s", len(got), tc.why)
			}
			if got[0].Reachable != tc.answered {
				t.Errorf("reported reachable=%v, want %v — %s", got[0].Reachable, tc.answered, tc.why)
			}
			// A source is how the spread rule counts, and SSO must count as its
			// own rather than be folded into a bucket it does not have.
			if got[0].Source != "evesso" {
				t.Errorf("observed source %q, want evesso", got[0].Source)
			}
		})
	}
}

func TestReportSSOIsSafeWithoutALimiter(t *testing.T) {
	// Mongo-only wiring and tests carry no client; reporting must not panic.
	deps := apideps.FromClients(&stackservices.Clients{}, nil, nil)
	deps.ReportSSO(t.Context(), errors.New("dial tcp: connection refused"))

	var absent *apideps.Deps
	absent.ReportSSO(t.Context(), nil)
}
