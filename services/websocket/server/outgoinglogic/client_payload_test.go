package outgoinglogic

import (
	"encoding/json"
	"strings"
	"testing"
)

// Refs are the internal representation and must not reach a browser. The routing
// fields carry them, so delivery strips them.
func TestClientPayloadStripsRoutingRefs(t *testing.T) {
	t.Parallel()
	in := []byte(`{
	  "collection":"user_job_documents",
	  "docID":"job-1",
	  "corporationRef":"corp_abc123",
	  "allianceRef":"alliance_def456",
	  "scopes":{"corporationRefs":["corp_abc123"],"accountIDs":["acct-1"]},
	  "sourceClientID":"c1",
	  "sourceSessionID":"s1",
	  "document":{"jobID":"job-1"}
	}`)

	got := string(ClientPayload(in))
	for _, leaked := range []string{"corporationRef", "allianceRef", "scopes", "corp_abc123", "alliance_def456", "sourceClientID", "sourceSessionID"} {
		if strings.Contains(got, leaked) {
			t.Fatalf("%q survived into the client payload:\n%s", leaked, got)
		}
	}

	var m map[string]any
	if err := json.Unmarshal([]byte(got), &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	for _, kept := range []string{"collection", "docID", "document"} {
		if _, ok := m[kept]; !ok {
			t.Fatalf("stripping removed %q, which the client needs:\n%s", kept, got)
		}
	}
}

// The account-scoped path carries no routing metadata, so it must pass through
// untouched rather than paying a re-encode.
func TestClientPayloadPassesThroughWhenNothingToStrip(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"user_job_documents","docID":"job-1","accountID":"acct-1"}`)

	got := ClientPayload(in)
	if &got[0] != &in[0] {
		t.Fatal("expected the original slice to be returned unchanged")
	}
}

func TestClientPayloadLeavesMalformedJSONAlone(t *testing.T) {
	t.Parallel()
	in := []byte(`not json`)
	if string(ClientPayload(in)) != string(in) {
		t.Fatal("malformed input must pass through rather than be dropped")
	}
}
