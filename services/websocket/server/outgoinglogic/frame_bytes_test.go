package outgoinglogic

import (
	jsonv1 "encoding/json"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

// ClientPayload rebuilds a frame when it has an id to redact or a position to
// stamp, and the result goes straight to a browser. What it rebuilds is a map
// decoded from the original, so key ordering and value formatting are the wire.
func TestRebuiltFrameBytesAreUnchanged(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		value map[string]any
	}{
		{"a stamped document update", map[string]any{
			"type": "doc.update", "collection": "jobs", "docID": "abc",
			"owner": "account:1", "position": 42.0,
			"document": map[string]any{"name": "run", "runs": 3.0},
		}},
		{"keys out of order", map[string]any{"z": 1.0, "a": "x", "m": 2.0}},
		{"empty collections", map[string]any{"list": []any{}, "object": map[string]any{}}},
		{"html in a value, which the wire escapes", map[string]any{"name": "a<b>c&d"}},
		{"a null", map[string]any{"previousDocument": nil}},
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
