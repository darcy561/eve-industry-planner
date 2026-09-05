package orchestrationprobes

import (
	"testing"

	eipnats "eve-industry-planner/shared/nats"
)

// A ping naming another role is not this replica's to answer; an unnamed one is.
func TestHealthStatusAnswersOwnRoleOnly(t *testing.T) {
	t.Parallel()
	opts := BusOptions{Role: "worker", InstanceID: "w1"}

	if _, answer := healthStatus(opts, eipnats.HealthPing{Role: "api"}); answer {
		t.Fatal("answered a ping aimed at another role")
	}
	status, answer := healthStatus(opts, eipnats.HealthPing{})
	if !answer {
		t.Fatal("did not answer an unnamed ping")
	}
	if status.Role != "worker" || status.InstanceID != "w1" {
		t.Fatalf("status=%+v", status)
	}
	if status.Ready || status.Error == "" {
		t.Fatalf("a bus with no ready check must report not ready: %+v", status)
	}
}

func TestStartBusDisabledNoop(t *testing.T) {
	t.Parallel()
	r, err := StartBus(t.Context(), BusOptions{Enabled: false})
	if err != nil {
		t.Fatal(err)
	}
	if r.Name() != "orchestrationprobes-bus-disabled" {
		t.Fatalf("name=%q", r.Name())
	}
	r.Stop(t.Context())
}
