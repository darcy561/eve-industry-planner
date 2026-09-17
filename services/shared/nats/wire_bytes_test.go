package nats

import (
	jsonv1 "encoding/json"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

// A message published here reaches a browser as the bytes written: audienceOutbound
// in the websocket server builds the client frame as `Frame: msg.Payload`, with no
// decode and no re-encode on any path. These are a wire the SPA reads, not an
// internal detail, and they have to stay what they were.
func TestPublishedFramesAreUnchangedBytes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		value any
	}{
		{"envelope with a payload", Message{
			Type:    "document",
			Subtype: "updated",
			Data:    jsonv1.RawMessage(`{"jobID":"abc","position":4}`),
		}},
		{"envelope with no payload", Message{Type: "empty"}},
		{"static data build", StaticDataMessage{Type: "staticData", BuildNumber: 2847, Version: "2025-03-11"}},
		{"static data build without a version", StaticDataMessage{Type: "staticData", BuildNumber: 2847}},
		// Map ordering is part of the wire wherever a payload is built as one.
		{"map payload", map[string]any{"z": 1.0, "a": "x", "m": []any{1.0, 2.0}}},
		{"empty collections", map[string]any{"list": []any{}, "object": map[string]any{}}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := jsoncodec.Marshal(tc.value)
			if err != nil {
				t.Fatal(err)
			}
			want, err := jsonv1.Marshal(tc.value)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != string(want) {
				t.Fatalf("frame bytes changed\n got: %s\nwant: %s", got, want)
			}
		})
	}
}
