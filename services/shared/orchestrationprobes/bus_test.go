package orchestrationprobes

import (
	"encoding/json"
	"testing"

	eipnats "eve-industry-planner/shared/nats"
)

func TestParseHealthPingRole(t *testing.T) {
	t.Parallel()
	role, ok := parseHealthPingRole(nil)
	if !ok || role != "" {
		t.Fatalf("nil: role=%q ok=%v", role, ok)
	}
	role, ok = parseHealthPingRole([]byte(`{"role":"api"}`))
	if !ok || role != "api" {
		t.Fatalf("raw: role=%q ok=%v", role, ok)
	}
	env, err := json.Marshal(eipnats.Message{
		Type: eipnats.MessageTypeHealth,
		Data: []byte(`{"role":"worker"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	role, ok = parseHealthPingRole(env)
	if !ok || role != "worker" {
		t.Fatalf("envelope: role=%q ok=%v", role, ok)
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
