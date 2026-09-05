package nats

import (
	"encoding/json"
	"testing"
)

// A ping arrives either bare or wrapped, and anything unreadable means every
// role should answer — a census defaults to all.
func TestParseHealthPing(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		data []byte
		want string
	}{
		{"nil", nil, ""},
		{"bare", []byte(`{"role":"api"}`), "api"},
		{"unreadable", []byte(`{`), ""},
	}
	for _, tc := range cases {
		if got := parseHealthPing(tc.data); got.Role != tc.want {
			t.Errorf("%s: role=%q want %q", tc.name, got.Role, tc.want)
		}
	}

	wrapped, err := json.Marshal(Message{Type: MessageTypeHealth, Data: []byte(`{"role":"worker"}`)})
	if err != nil {
		t.Fatal(err)
	}
	if got := parseHealthPing(wrapped); got.Role != "worker" {
		t.Errorf("wrapped: role=%q want worker", got.Role)
	}
}

func TestDecodeHealthStatusRejectsWrongType(t *testing.T) {
	t.Parallel()
	if _, ok := decodeHealthStatus(Message{Type: MessageTypeWSCommand, Data: []byte(`{"role":"api"}`)}); ok {
		t.Fatal("decoded a reply of the wrong type")
	}
	if _, ok := decodeHealthStatus(Message{Type: MessageTypeHealth}); ok {
		t.Fatal("decoded an empty reply")
	}
	status, ok := decodeHealthStatus(Message{Type: MessageTypeHealth, Data: []byte(`{"role":"api","ready":true}`)})
	if !ok || status.Role != "api" || !status.Ready {
		t.Fatalf("status=%+v ok=%v", status, ok)
	}
}
