package outgoinglogic

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/shared/models"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/testing/keys"
)

// Refs are the internal representation and must not reach a browser. The routing
// fields carry them, so delivery strips them.
// testOwner is the owner the tests below deliver for, when the owner is not what
// they are about.
var testOwner = models.AccountOwner("acct-payload")

func TestClientPayloadStripsRoutingRefs(t *testing.T) {
	t.Parallel()
	in := []byte(`{
	  "collection":"user_job_documents",
	  "docID":"job-1",
	  "ownerKey":"corporation:corp_abc123",
	  "sourceClientID":"c1",
	  "sourceSessionID":"s1",
	  "document":{"jobID":"job-1"}
	}`)

	got := string(ClientPayload(in, testOwner, keys.EntityCipher(t), 0))
	for _, leaked := range []string{"ownerKey", "corp_abc123", "sourceClientID", "sourceSessionID"} {
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

// Every payload names its owner, so every payload is re-encoded. A message with
// no owner to name is the exception and passes through untouched.
func TestClientPayloadPassesThroughWhenThereIsNoOwnerToName(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"user_job_documents","docID":"job-1"}`)

	got := ClientPayload(in, models.Owner{}, keys.EntityCipher(t), 0)
	if &got[0] != &in[0] {
		t.Fatal("expected the original slice to be returned unchanged")
	}
}

// The owner key is replaced by the handle for the same owner: a client is told
// which planner a message belongs to, in the form it can read, while the key —
// which carries a ref for the org kinds — never reaches it.
func TestClientPayloadNamesTheOwnerAsAHandle(t *testing.T) {
	t.Parallel()
	owner := models.AccountOwner("acct-1")
	in := []byte(`{"collection":"user_job_documents","docID":"job-1","ownerKey":"account:acct-1"}`)

	got := decodeJSONMap(t, ClientPayload(in, owner, keys.EntityCipher(t), 0))
	if _, present := got["ownerKey"]; present {
		t.Error("the routing key survived into the client payload")
	}
	if got["owner"] != "account:acct-1" {
		t.Errorf("owner = %v, want the account's handle", got["owner"])
	}
}

// An org owner is named by its id rather than the ref it is stored under, which
// is the same conversion the endpoints make.
func TestClientPayloadNamesAnOrgOwnerByItsID(t *testing.T) {
	t.Parallel()
	cipher := keys.EntityCipher(t)
	ref, err := cipher.Corporation(98000001)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	in := []byte(`{"collection":"user_job_documents","docID":"job-1"}`)

	got := decodeJSONMap(t, ClientPayload(in, models.CorporationOwner(ref), cipher, 0))
	if got["owner"] != "corporation:98000001" {
		t.Errorf("owner = %v, want the corporation's id", got["owner"])
	}
}

func decodeJSONMap(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	return m
}

func TestClientPayloadLeavesMalformedJSONAlone(t *testing.T) {
	t.Parallel()
	in := []byte(`not json`)
	if string(ClientPayload(in, testOwner, keys.EntityCipher(t), 0)) != string(in) {
		t.Fatal("malformed input must pass through rather than be dropped")
	}
}

// A job document carries refs in its body, not only in the routing metadata.
// The client is owed the ids behind them and must never see the refs.
func TestClientPayloadRestoresIDsInTheDocumentBody(t *testing.T) {
	t.Parallel()
	c := keys.EntityCipher(t)

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
	      {"job_id":512345678,"corporation_ref":"` + corpRef + `"},
	      {"job_id":512345679,"character_ref":"` + charRef + `"}
	    ]}}
	  }
	}`)

	got := ClientPayload(in, testOwner, c, 0)
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
	if first["corporation_id"] != float64(98765432) {
		t.Fatalf("linkedJobs[0] corporation_id = %v, want 98765432", first["corporation_id"])
	}
	if _, still := first["corporation_ref"]; still {
		t.Fatal("linkedJobs[0] still carries corporation_ref")
	}
	second := linked[1].(map[string]any)
	if second["character_id"] != float64(91234567) {
		t.Fatalf("linkedJobs[1] character_id = %v, want 91234567", second["character_id"])
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
	c := keys.EntityCipher(t)

	other, err := entityid.New([]byte("ffffffffffffffffffffffffffffffff"))
	if err != nil {
		t.Fatalf("entityid.New: %v", err)
	}
	foreign, err := other.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}

	in := []byte(`{"collection":"c","document":{"corporation_ref":"` + foreign + `"}}`)

	got := ClientPayload(in, testOwner, c, 0)
	if strings.Contains(string(got), foreign) {
		t.Fatalf("an undecryptable ref survived:\n%s", got)
	}

	var m map[string]any
	if err := json.Unmarshal(got, &m); err != nil {
		t.Fatalf("client payload is not valid JSON: %v", err)
	}
	doc := m["document"].(map[string]any)
	if _, present := doc["corporation_id"]; present {
		t.Fatal("a ref that did not decrypt must not produce an id")
	}
}

// Without a cipher the payload must still be safe: refs are removed even though
// no id can be produced.
func TestClientPayloadWithoutACipherStillRemovesRefs(t *testing.T) {
	t.Parallel()
	c := keys.EntityCipher(t)
	ref, err := c.Corporation(98765432)
	if err != nil {
		t.Fatalf("Corporation: %v", err)
	}

	in := []byte(`{"collection":"c","document":{"corporation_ref":"` + ref + `"}}`)
	got := ClientPayload(in, testOwner, nil, 0)
	if strings.Contains(string(got), ref) {
		t.Fatalf("a ref survived without a cipher:\n%s", got)
	}
}

// Keys that merely end in the suffix but hold no ref must be left alone.
func TestClientPayloadLeavesNonRefFieldsAlone(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"c","document":{"journal_ref_id":77,"some_ref":"not-a-ref","nested":{"other_ref":""}}}`)

	got := ClientPayload(in, testOwner, keys.EntityCipher(t), 0)
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

// The position tells a client whether a change is one it has already applied, so
// it has to survive the rewrite that strips routing and restores ids.
func TestClientPayloadCarriesTheDeliveryPosition(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"job_documents","docID":"job-1","document":{"jobID":"job-1"}}`)

	got := decodeJSONMap(t, ClientPayload(in, testOwner, keys.EntityCipher(t), 4242))

	if got["position"] != float64(4242) {
		t.Fatalf("position = %v, want 4242", got["position"])
	}
}

// A message with no metadata to read carries no position rather than a zero one,
// which a client would otherwise compare against and discard the change.
func TestClientPayloadLeavesOutAnUnknownPosition(t *testing.T) {
	t.Parallel()
	in := []byte(`{"collection":"job_documents","docID":"job-1","document":{"jobID":"job-1"}}`)

	got := decodeJSONMap(t, ClientPayload(in, testOwner, keys.EntityCipher(t), 0))

	if _, present := got["position"]; present {
		t.Fatalf("position present with nothing to report: %v", got["position"])
	}
}
