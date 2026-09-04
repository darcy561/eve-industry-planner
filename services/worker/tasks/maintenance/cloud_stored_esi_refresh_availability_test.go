package maintenance

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"eve-industry-planner/shared/esiclient"

	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"
	esitasks "eve-industry-planner/worker/tasks/esi"

	"github.com/hibiken/asynq"
)

// This task rotates SSO refresh tokens at login.eveonline.com. It never calls
// ESI and holds no bucket, but SSO goes down with everything else — so it
// observes the fleet's view of availability rather than pre-flighting a status
// endpoint that costs tokens and answers a different question.
//
// The distinction matters in both directions: it must defer while the servers
// are away, and it must not be stopped by anything to do with rate limits.

// rotationTask builds the envelope the worker receives: an asynq payload
// wrapping a NATS message wrapping the request.
func rotationTask(t *testing.T, accountID string) *asynq.Task {
	t.Helper()

	request, err := json.Marshal(eipnats.CloudStoredEsiRefreshMaintenanceRequest{AccountID: accountID})
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	message, err := json.Marshal(eipnats.Message{Data: request})
	if err != nil {
		t.Fatalf("message: %v", err)
	}
	envelope, err := json.Marshal(map[string]any{
		"task_type": eipnats.CloudStoredEsiRefreshMaintenance.Name,
		"data":      json.RawMessage(message),
	})
	if err != nil {
		t.Fatalf("envelope: %v", err)
	}
	return asynq.NewTask(eipnats.CloudStoredEsiRefreshMaintenance.Name, envelope)
}

func TestCloudEsiRefreshDoesNotConsultESI(t *testing.T) {
	task := rotationTask(t, "acct-1")
	var err error

	// Both ESI clients absent, and no Redis for a status cache to live in. If
	// anything still reached for ESI this would panic or report unavailability
	// rather than getting as far as its own configuration.
	deps := &esitasks.TaskDependencies{}

	err = CloudStoredEsiRefreshMaintenance(t.Context(), task, deps)
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
	task := rotationTask(t, "acct-1")

	// Mongo present so the run gets past its dependency checks; availability is
	// then what stops it, before any config is read or any row is touched.
	probe := time.Now().Add(30 * time.Second)
	deps := &esitasks.TaskDependencies{
		Mongo: &eipmongo.Mongo{},
		ESI:   &gateStub{gated: true, nextProbe: probe},
	}

	err := CloudStoredEsiRefreshMaintenance(t.Context(), task, deps)
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
	task := rotationTask(t, "acct-1")

	deps := &esitasks.TaskDependencies{
		Mongo: &eipmongo.Mongo{},
		ESI:   &gateStub{gated: false},
	}

	err := CloudStoredEsiRefreshMaintenance(t.Context(), task, deps)
	if err == nil {
		t.Fatal("expected the task to stop further on, at its own configuration")
	}
	// An open gate must not stop it: whatever it fails on next, it is not this.
	if esiclient.IsRateLimit(err) {
		t.Errorf("stopped with a rate-limit refusal (%v); an open gate should let it through", err)
	}
}
