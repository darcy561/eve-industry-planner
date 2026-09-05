package server

import (
	"encoding/json"
	"testing"
)

// The partition key is what keeps one owner's messages on one shard goroutine, so
// they are delivered in the order they were published. Two messages for the same
// owner that hashed to different shards could be delivered out of order; two
// unrelated owners sharing a key would serialise for no reason.
func TestOutboundDocPartitionKey(t *testing.T) {
	t.Parallel()

	payload := func(fields map[string]any) []byte {
		b, err := json.Marshal(fields)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}

	for name, tc := range map[string]struct {
		payload []byte
		docID   string
		want    string
	}{
		"account owner": {
			payload: payload(map[string]any{"ownerKey": "account:acct-1"}),
			docID:   "jobs|j1",
			want:    "account:acct-1",
		},
		"corporation owner": {
			payload: payload(map[string]any{"ownerKey": "corporation:corp_56_JxK"}),
			docID:   "jobs|j1",
			want:    "corporation:corp_56_JxK",
		},
		// No readable owner: partition by document instead, so the message still has
		// a stable shard rather than sharing one with every other unroutable message.
		"no owner": {
			payload: payload(map[string]any{"collection": "jobs"}),
			docID:   "jobs|j1",
			want:    "explicit:jobs|j1",
		},
		"unreadable owner": {
			payload: payload(map[string]any{"ownerKey": "corporation:98000001"}),
			docID:   "jobs|j1",
			want:    "explicit:jobs|j1",
		},
		"malformed payload": {
			payload: []byte("{not json"),
			docID:   "jobs|j1",
			want:    "err:jobs|j1",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := outboundDocPartitionKey(tc.docID, tc.payload); got != tc.want {
				t.Fatalf("partition key = %q, want %q", got, tc.want)
			}
		})
	}
}

// Two documents owned by the same owner must share a shard; two owners must be
// free to land on different ones. This is the property the key exists for, and it
// is not visible from any single call.
func TestOutboundDocPartitionKeyGroupsByOwnerNotByDocument(t *testing.T) {
	t.Parallel()

	key := func(ownerKey, docID string) string {
		b, err := json.Marshal(map[string]any{"ownerKey": ownerKey})
		if err != nil {
			t.Fatal(err)
		}
		return outboundDocPartitionKey(docID, b)
	}

	if a, b := key("account:acct-1", "jobs|j1"), key("account:acct-1", "jobs|j2"); a != b {
		t.Fatalf("one owner's documents split across keys: %q and %q", a, b)
	}
	if a, b := key("account:acct-1", "jobs|j1"), key("account:acct-2", "jobs|j1"); a == b {
		t.Fatalf("two owners share key %q, serialising unrelated work", a)
	}
}
