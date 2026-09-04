package maintenance

import (
	"context"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/worker/taskrun"
)

// This task rotates SSO refresh tokens at login.eveonline.com. It never calls
// ESI and holds no bucket, but SSO goes down with everything else — so it
// observes the fleet's view of availability rather than pre-flighting a status
// endpoint that costs tokens and answers a different question.
//
// The distinction matters in both directions: it must defer while the servers
// are away, and it must not be stopped by anything to do with rate limits.

func TestCloudEsiRefreshDoesNotConsultESI(t *testing.T) {
	request := eipnats.CloudStoredEsiRefreshMaintenanceRequest{AccountID: "acct-1"}
	var err error

	// Both ESI clients absent, and no Redis for a status cache to live in. If
	// anything still reached for ESI this would panic or report unavailability
	// rather than getting as far as its own configuration.
	deps := &taskrun.Dependencies{}

	err = CloudStoredEsiRefreshMaintenance(t.Context(), request, deps)
	if err == nil {
		t.Fatal("expected the task to stop on its own missing dependencies")
	}

	// It must fail on what it genuinely needs — Mongo — rather than on ESI.
	if !strings.Contains(err.Error(), "mongo") {
		t.Errorf("stopped with %q; expected it to get as far as needing Mongo, not to be blocked by ESI", err)
	}
	for _, esiWord := range []string{"server unavailable", "rate limit", "status"} {
		if strings.Contains(strings.ToLower(err.Error()), esiWord) {
			t.Errorf("stopped with %q, which mentions ESI; this task does not call it", err)
		}
	}
}

// gateStub answers availability without a Redis behind it.
type gateStub struct {
	esiclient.API
	gated     bool
	nextProbe time.Time
	observed  []bool
}

func (g *gateStub) Availability(context.Context) (esiclient.DowntimeState, error) {
	return esiclient.DowntimeState{Gated: g.gated, NextProbe: g.nextProbe}, nil
}

func (g *gateStub) Observe(_ context.Context, _ string, reachable bool) error {
	g.observed = append(g.observed, reachable)
	return nil
}

func TestCloudEsiRefreshDefersWhileTheServersAreAway(t *testing.T) {
	request := eipnats.CloudStoredEsiRefreshMaintenanceRequest{AccountID: "acct-1"}

	// Mongo present so the run gets past its dependency checks; availability is
	// then what stops it, before any config is read or any row is touched.
	probe := time.Now().Add(30 * time.Second)
	deps := &taskrun.Dependencies{
		Mongo: &eipmongo.Mongo{},
		ESI:   &gateStub{gated: true, nextProbe: probe},
	}

	err := CloudStoredEsiRefreshMaintenance(t.Context(), request, deps)
	if err == nil {
		t.Fatal("a rotation attempted during an outage just fails; it should be deferred instead")
	}

	refusal, ok := esiclient.AsRateLimit(err)
	if !ok {
		t.Fatalf("err = %v, want a downtime deferral asynq can schedule from", err)
	}
	if refusal.Kind != esiclient.KindDowntime {
		t.Errorf("Kind = %s, want downtime", refusal.Kind)
	}
	if !refusal.RetryAfter.Equal(probe) {
		t.Errorf("RetryAfter = %v, want the next probe at %v", refusal.RetryAfter, probe)
	}
}

func TestCloudEsiRefreshProceedsWhenTheServersAnswer(t *testing.T) {
	request := eipnats.CloudStoredEsiRefreshMaintenanceRequest{AccountID: "acct-1"}

	deps := &taskrun.Dependencies{
		Mongo: &eipmongo.Mongo{},
		ESI:   &gateStub{gated: false},
	}

	err := CloudStoredEsiRefreshMaintenance(t.Context(), request, deps)
	if err == nil {
		t.Fatal("expected the task to stop further on, at its own configuration")
	}
	// An open gate must not stop it: whatever it fails on next, it is not this.
	if esiclient.IsRateLimit(err) {
		t.Errorf("stopped with a rate-limit refusal (%v); an open gate should let it through", err)
	}
}

func TestOnlyTheTokenEndpointDecidesWhatIsObserved(t *testing.T) {
	cases := []struct {
		name  string
		stats cloudEsiMaintainStats
		want  []bool
		why   string
	}{
		{
			name:  "a row was refreshed",
			stats: cloudEsiMaintainStats{RowsRefreshed: 3, SSOAnswered: 3},
			want:  []bool{true},
			why:   "reaching SSO is evidence the servers are up",
		},
		{
			name:  "every token was refused",
			stats: cloudEsiMaintainStats{RowsFailed: 4, SSOAnswered: 4},
			want:  []bool{true},
			why:   "a refusal is the server answering, so dead tokens must not read as an outage",
		},
		{
			name:  "nothing answered",
			stats: cloudEsiMaintainStats{RowsFailed: 4, SSOSilent: 4},
			want:  []bool{false},
			why:   "this is the evidence the spread rule is waiting for",
		},
		{
			name:  "the keyring is broken",
			stats: cloudEsiMaintainStats{RowsFailed: 6},
			want:  nil,
			why:   "no row reached SSO, so this says nothing about CCP's servers",
		},
		{
			name:  "some answered and some did not",
			stats: cloudEsiMaintainStats{RowsRefreshed: 1, SSOAnswered: 1, SSOSilent: 3},
			want:  []bool{true},
			why:   "one reply proves the server is there, whatever the others did",
		},
		{
			name:  "there was nothing to rotate",
			stats: cloudEsiMaintainStats{RowsSkipped: 5},
			want:  nil,
			why:   "a pass that called nothing observed nothing",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gate := &gateStub{}
			observeSSO(t.Context(), gate, tc.stats)

			if len(gate.observed) != len(tc.want) {
				t.Fatalf("made %d observations, want %d — %s", len(gate.observed), len(tc.want), tc.why)
			}
			for i, want := range tc.want {
				if gate.observed[i] != want {
					t.Errorf("observed %v, want %v — %s", gate.observed[i], want, tc.why)
				}
			}
		})
	}
}

func TestObserveSSOIsSafeWithoutAClient(t *testing.T) {
	observeSSO(t.Context(), nil, cloudEsiMaintainStats{SSOSilent: 2})
}
