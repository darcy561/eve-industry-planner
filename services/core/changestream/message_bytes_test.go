package changestream

import (
	jsonv1 "encoding/json"
	"testing"

	"eve-industry-planner/shared/jsoncodec"
)

// The websocket relays this payload to a browser, rebuilding it only when it has
// an id to redact or a position to stamp, so these bytes are what the SPA reads.
func TestChangeStreamMessageBytesAreUnchanged(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		message ChangeStreamMessage
	}{
		{"a document update", ChangeStreamMessage{
			Subject:       "doc.update.acct.jobs.abc",
			Collection:    "jobs",
			DocID:         "abc",
			OperationType: "update",
			OwnerKey:      "account:1",
			Document:      map[string]any{"name": "Tritanium run", "runs": 10.0, "tags": []any{}},
		}},
		{"a delete carrying the previous document", ChangeStreamMessage{
			Subject:          "doc.update.acct.jobs.abc",
			Collection:       "jobs",
			DocID:            "abc",
			OperationType:    "delete",
			PreviousDocument: map[string]any{"name": "gone", "nested": map[string]any{"z": 1.0, "a": 2.0}},
		}},
		{"the account flags, which are omitzero", ChangeStreamMessage{
			Subject:                 "doc.update.acct.users.1",
			Collection:              "users",
			DocID:                   "1",
			OperationType:           "update",
			RefreshTokensChanged:    true,
			LinkedCharactersChanged: false,
		}},
		{"an empty document", ChangeStreamMessage{Subject: "s", Collection: "c", DocID: "d", OperationType: "insert"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := jsoncodec.Marshal(tc.message)
			if err != nil {
				t.Fatal(err)
			}
			want, err := jsonv1.Marshal(tc.message)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != string(want) {
				t.Fatalf("payload changed\n got: %s\nwant: %s", got, want)
			}
		})
	}
}

// A stored string holding invalid UTF-8 stops this message rather than being
// repaired into one that reads differently. The event is then dropped, so the
// SPA goes stale for that document instead of showing mangled text — which is
// the trade this codec makes, and the shape an operator would see it in.
func TestChangeStreamMessageRefusesInvalidUTF8(t *testing.T) {
	t.Parallel()

	message := ChangeStreamMessage{
		Subject:       "doc.update.acct.jobs.abc",
		Collection:    "jobs",
		DocID:         "abc",
		OperationType: "update",
		Document:      map[string]any{"name": "job \xff\xfe name"},
	}
	if _, err := jsoncodec.Marshal(message); err == nil {
		t.Fatal("invalid UTF-8 in a document must stop the message")
	}
}
