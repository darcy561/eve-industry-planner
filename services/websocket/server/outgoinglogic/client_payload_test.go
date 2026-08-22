package outgoinglogic

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
)

func testCipher(t *testing.T) *entityid.Cipher {
	t.Helper()
	c, err := entityid.New([]byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	return c
}

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

	got := string(ClientPayload(in, testCipher(t)))
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

	got := ClientPayload(in, testCipher(t))
	if &got[0] != &in[0] {
		t.Fatal("expected the original slice to be returned unchanged")
	}
}

func TestClientPayloadLeavesMalformedJSONAlone(t *testing.T) {
	t.Parallel()
	in := []byte(`not json`)
	if string(ClientPayload(in, testCipher(t))) != string(in) {
		t.Fatal("malformed input must pass through rather than be dropped")
	}
}

// A job document carries refs in its body, not only in the routing metadata.
// The client is owed the ids behind them and must never see the refs.
func TestClientPayloadRestoresIDsInTheDocumentBody(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	corpRef, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}
	charRef, err := c.Character(91234567)
	if err != nil {
		t.Fatalf("Character: %v", err)
	}

	in := []byte(`{
	  "collection":"user_job_documents",
	  "docID":"job-1",
	  "corporationRef":"` + corpRef + `",
	  "document":{
	    "jobID":"job-1",
	    "_meta":{"accountID":"acct-1","corporationRef":"` + corpRef + `"},
	    "build":{"costs":{"linkedJobs":[
	      {"job_id":512345678,"corporationRef":"` + corpRef + `"},
	      {"job_id":512345679,"characterRef":"` + charRef + `"}
	    ]}}
	  }
	}`)

	got := ClientPayload(in, c)
	if strings.Contains(string(got), corpRef) || strings.Contains(string(got), charRef) {
		t.Fatalf("a ref survived into the client payload:\n%s", got)
	}

	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	doc := m["document"].(map[string]any)

	meta := doc["_meta"].(map[string]any)
	if meta["corporationID"] != float64(98765432) {
		t.Fatalf("_meta corporationID = %v, want 98765432", meta["corporationID"])
	}
	if _, still := meta["corporationRef"]; still {
		t.Fatal("_meta still carries corporationRef")
	}

	linked := doc["build"].(map[string]any)["costs"].(map[string]any)["linkedJobs"].([]any)
	first := linked[0].(map[string]any)
	if first["corporationID"] != float64(98765432) {
		t.Fatalf("linkedJobs[0] corporationID = %v, want 98765432", first["corporationID"])
	}
	if _, still := first["corporationRef"]; still {
		t.Fatal("linkedJobs[0] still carries corporationRef")
	}
	second := linked[1].(map[string]any)
	if second["characterID"] != float64(91234567) {
		t.Fatalf("linkedJobs[1] characterID = %v, want 91234567", second["characterID"])
	}
	// Non-identity fields are left exactly as they were.
	if first["job_id"] != float64(512345678) {
		t.Fatalf("job_id was rewritten: %v", first["job_id"])
	}
}

// A ref that cannot be decrypted must be dropped, not passed through. Failing
// open here would leak the exact value this strip exists to contain.
func TestClientPayloadDropsRefsItCannotDecrypt(t *testing.T) {
	t.Parallel()
	c := testCipher(t)

	other, err := entityid.New([]byte("ffffffffffffffffffffffffffffffff"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	foreign, err := other.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}

	in := []byte(`{"collection":"c","document":{"corporationRef":"` + foreign + `"}}`)

	got := ClientPayload(in, c)
	if strings.Contains(string(got), foreign) {
		t.Fatalf("an undecryptable ref survived:\n%s", got)
	}

	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	doc := m["document"].(map[string]any)
	if _, present := doc["corporationID"]; present {
		t.Fatal("a ref that did not decrypt must not produce an id")
	}
}

// Without a cipher the payload must still be safe: refs are removed even though
// no id can be produced.
func TestClientPayloadWithoutACipherStillRemovesRefs(t *testing.T) {
	t.Parallel()
	c := testCipher(t)
	ref, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}

	in := []byte(`{"collection":"c","document":{"corporationRef":"` + ref + `"}}`)
	got := ClientPayload(in, nil)
	if strings.Contains(string(got), ref) {
		t.Fatalf("a ref survived without a cipher:\n%s", got)
	}
}

// Keys that merely end in the suffix but hold no ref must be left alone.
func TestClientPayloadLeavesNonRefFieldsAlone(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"c","document":{"journal_ref_id":77,"some_ref":"not-a-ref","nested":{"other_ref":""}}}`)

	got := ClientPayload(in, testCipher(t))
	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	doc := m["document"].(map[string]any)
	if doc["journal_ref_id"] != float64(77) {
		t.Fatalf("journal_ref_id was rewritten: %v", doc["journal_ref_id"])
	}
	if doc["some_ref"] != "not-a-ref" {
		t.Fatalf("some_ref was rewritten: %v", doc["some_ref"])
	}
}

// Refs are camelCase wherever they are stored, so a snake_case lookalike is an
// ordinary field and must survive untouched.
func TestClientPayloadIgnoresSnakeCaseLookalikes(t *testing.T) {
	t.Parallel()
	c := testCipher(t)
	ref, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}

	in := []byte(`{"collection":"c","document":{"corporation_ref":"` + ref + `","journal_ref_id":77}}`)

	var m map[string]any
	if err := json.Unmarshal(ClientPayload(in, c), &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	doc := m["document"].(map[string]any)
	if doc["corporation_ref"] != ref {
		t.Fatalf("corporation_ref was rewritten: %v", doc["corporation_ref"])
	}
	if doc["journal_ref_id"] != float64(77) {
		t.Fatalf("journal_ref_id was rewritten: %v", doc["journal_ref_id"])
	}
}
