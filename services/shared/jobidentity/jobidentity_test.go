package jobidentity

import (
	"encoding/json"
	"strings"
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/protectedfields"
	"eve-industry-planner/testing/keys"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func jobWithIDs() *models.Job {
	job := &models.Job{JobID: "job-1"}
	job.Build.Sale.Transactions = []models.Transaction{{TransactionID: 7712345678, CorporationID: 98765432, CharacterID: 91234567}}
	job.Build.Sale.MarketOrders = []models.MarketOrder{{OrderID: 6201234567, CorporationID: 98765432}}
	job.Build.Sale.BrokersFee = []models.BrokerFee{{ID: 5500000001, CorporationID: 98765432}}
	job.Build.Costs.LinkedJobs = []models.LinkedESIJob{{JobID: 512345678, CorporationID: 98765432}}
	return job
}

func TestToRefsReplacesEveryIDAndMarksTheSpec(t *testing.T) {
	job := jobWithIDs()
	if err := Encrypt(job, keys.EntityCipher(t)); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}

	if HasRawIDs(job) {
		t.Fatal("no raw id may survive conversion")
	}
	if job.Protected == nil || job.Protected.Spec != string(protectedfields.SpecJobFieldsV1) {
		t.Fatalf("protection = %+v, want spec %q", job.Protected, protectedfields.SpecJobFieldsV1)
	}
	for _, got := range []string{
		job.Build.Sale.Transactions[0].CorporationRef,
		job.Build.Sale.MarketOrders[0].CorporationRef,
		job.Build.Sale.BrokersFee[0].CorporationRef,
		job.Build.Costs.LinkedJobs[0].CorporationRef,
	} {
		if kind, ok := entityid.ParseKind(got); !ok || kind != entityid.KindCorp {
			t.Fatalf("corporation ref = %q, want a well formed corp ref", got)
		}
	}
	if kind, ok := entityid.ParseKind(job.Build.Sale.Transactions[0].CharacterRef); !ok || kind != entityid.KindCharacter {
		t.Fatalf("character ref = %q", job.Build.Sale.Transactions[0].CharacterRef)
	}
}

// The same id must always yield the same ref, since refs are used as identity for
// aggregation, lock partitions and tenant routing.
func TestRefsAreDeterministicAcrossDocuments(t *testing.T) {
	h := keys.EntityCipher(t)
	a, b := jobWithIDs(), jobWithIDs()

	if err := Encrypt(a, h); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}
	if err := Encrypt(b, h); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}
	if a.Build.Costs.LinkedJobs[0].CorporationRef != b.Build.Costs.LinkedJobs[0].CorporationRef {
		t.Fatal("the same corporation id produced different refs")
	}
}

// Different entity kinds must not collide, so a corporation and a character with
// the same numeric id stay distinguishable.
func TestKindsDoNotCollide(t *testing.T) {
	job := &models.Job{JobID: "job-collide"}
	job.Build.Sale.Transactions = []models.Transaction{{TransactionID: 1, CorporationID: 42, CharacterID: 42}}

	if err := Encrypt(job, keys.EntityCipher(t)); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}
	line := job.Build.Sale.Transactions[0]
	if line.CorporationRef == line.CharacterRef {
		t.Fatalf("one id produced the same ref for two kinds: %q", line.CorporationRef)
	}
}

func TestToRefsIsIdempotent(t *testing.T) {
	h := keys.EntityCipher(t)
	job := jobWithIDs()

	if err := Encrypt(job, h); err != nil {
		t.Fatalf("first ToRefs: %v", err)
	}
	first := job.Build.Costs.LinkedJobs[0].CorporationRef

	if err := Encrypt(job, h); err != nil {
		t.Fatalf("second ToRefs: %v", err)
	}
	if got := job.Build.Costs.LinkedJobs[0].CorporationRef; got != first {
		t.Fatalf("re-running changed the ref: %q then %q", first, got)
	}
}

func TestToRefsRequiresAHelper(t *testing.T) {
	if err := Encrypt(jobWithIDs(), nil); err == nil {
		t.Fatal("expected an error without a helper")
	}
}

// Raw ids must not reach the database, and refs must not reach the client.
func TestPersistedShapeCarriesRefsNotIDs(t *testing.T) {
	job := jobWithIDs()
	if err := Encrypt(job, keys.EntityCipher(t)); err != nil {
		t.Fatalf("ToRefs: %v", err)
	}

	raw, err := bson.Marshal(job)
	if err != nil {
		t.Fatalf("bson.Marshal: %v", err)
	}
	// Round-trip through JSON so nested documents are plain maps regardless of
	// whether bson decoded them as D or M.
	var stored map[string]any
	if err := bson.Unmarshal(raw, &stored); err != nil {
		t.Fatalf("bson.Unmarshal: %v", err)
	}
	flat, err := json.Marshal(stored)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	persisted := string(flat)

	if strings.Contains(persisted, `"corporation_id"`) {
		t.Fatalf("a raw corporation id reached the persisted document:\n%s", persisted)
	}
	if strings.Contains(persisted, `"character_id"`) {
		t.Fatalf("a raw character id reached the persisted document:\n%s", persisted)
	}
	if !strings.Contains(persisted, `"corporation_ref"`) {
		t.Fatalf("expected persisted corporation_ref:\n%s", persisted)
	}
	if !strings.Contains(persisted, `"character_ref"`) {
		t.Fatalf("expected persisted character_ref:\n%s", persisted)
	}
}

// The client sees ids, never refs.
func TestClientShapeCarriesIDsNotRefs(t *testing.T) {
	job := jobWithIDs()

	raw, err := json.Marshal(job)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	served := string(raw)

	if !strings.Contains(served, `"corporation_id"`) {
		t.Fatalf("expected the client shape to carry corporation_id:\n%s", served)
	}
	if strings.Contains(served, `"corporation_ref"`) || strings.Contains(served, `"protected"`) {
		t.Fatalf("a ref leaked to the client shape:\n%s", served)
	}
}

// A stored job must survive the full client round trip: the response boundary
// restores the ids, the client echoes the document back, and the write path
// re-derives the identical stored values. Encryption is deterministic, so the
// values must match byte for byte — if they do not, a save silently replaces a
// job's identity with nothing, and it cannot be recovered.
func TestClientRoundTripPreservesStoredIdentity(t *testing.T) {
	c := keys.EntityCipher(t)

	stored := jobWithIDs()
	if err := Encrypt(stored, c); err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	want := storedValues(t, stored)
	// One per populated id in jobWithIDs: three corporations across the sale
	// lines, the linked job's corporation, and the transaction's character.
	if len(want) != 5 {
		t.Fatalf("expected 5 stored values, got %d", len(want))
	}

	// Response boundary: restore the ids the client is owed.
	outgoing := *stored
	if err := Decrypt(&outgoing, c); err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	body, err := json.Marshal(outgoing)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// The client holds only what the response carried, and echoes it back.
	var echoed models.Job
	if err := json.Unmarshal(body, &echoed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if err := Encrypt(&echoed, c); err != nil {
		t.Fatalf("Encrypt after echo: %v", err)
	}

	got := storedValues(t, &echoed)
	if len(got) != len(want) {
		t.Fatalf("stored value count = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("stored value %d = %q after round trip, want %q", i, got[i], want[i])
		}
		if got[i] == "" {
			t.Fatalf("stored value %d was destroyed by the round trip", i)
		}
	}
}

// The response must carry the raw ids and never the stored values.
func TestResponseCarriesIDsAndNotStoredValues(t *testing.T) {
	c := keys.EntityCipher(t)

	job := jobWithIDs()
	if err := Encrypt(job, c); err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	stored := storedValues(t, job)

	if err := Decrypt(job, c); err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	body, err := json.Marshal(job)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	payload := string(body)

	for _, value := range stored {
		if strings.Contains(payload, value) {
			t.Fatalf("response leaks the stored value %q", value)
		}
	}
	for _, want := range []string{"98765432", "91234567"} {
		if !strings.Contains(payload, want) {
			t.Fatalf("response is missing the raw id %s", want)
		}
	}
}

// storedValues reads every target's stored value through the declaration, so it
// cannot drift from the field set the package converts.
func storedValues(t *testing.T, job *models.Job) []string {
	t.Helper()
	var out []string
	for _, target := range Declaration.Targets(job) {
		if target.Ref != nil && *target.Ref != "" {
			out = append(out, *target.Ref)
		}
	}
	return out
}
