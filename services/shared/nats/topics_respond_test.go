package nats

import (
	"encoding/json"
	"testing"
)

func TestRespondEnvelopeShape(t *testing.T) {
	t.Parallel()
	status := HealthStatus{Role: "api", InstanceID: "api-1", Healthy: true, Ready: true, TimeUnixMs: 1}
	data, err := json.Marshal(status)
	if err != nil {
		t.Fatal(err)
	}
	env := Message{Type: MessageTypeHealth, Data: data}
	raw, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	var got Message
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got.Type != MessageTypeHealth {
		t.Fatalf("type=%q", got.Type)
	}
	var hs HealthStatus
	if err := json.Unmarshal(got.Data, &hs); err != nil {
		t.Fatal(err)
	}
	if hs.Role != "api" || !hs.Ready {
		t.Fatalf("%+v", hs)
	}
}
