package outgoinglogic

import (
	"encoding/json"
	"encoding/json/jsontext"
	"maps"
	"slices"
	"testing"

	"eve-industry-planner/shared/crypto/entityid"
	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/testing/keys"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestClientPayloadKeysMatchTheAPIResponse(t *testing.T) {
	t.Parallel()
	cipher := keys.EntityCipher(t)
	job := parityJob(t, cipher)

	wsDoc, ok := deliver(t, cipher, "document", jsontext.Value(storedExtJSON(t, job))).(map[string]any)
	if !ok {
		t.Fatal("the whole document was not delivered as an object")
	}

	for _, path := range parityRows {
		compareRow(t, apiShape(t, job, cipher), wsDoc, path, "the whole document")
	}
}

func TestClientPayloadKeysMatchTheAPIResponseForADelta(t *testing.T) {
	t.Parallel()
	cipher := keys.EntityCipher(t)
	job := parityJob(t, cipher)
	stored := storedDocument(t, job)

	changed, err := models.JobJSONChanges(map[string]any{
		"esi.transactions.77":        rowAt(t, stored, "esi", "transactions", "77"),
		"esi.industryJobs.512345678": rowAt(t, stored, "esi", "industryJobs", "512345678"),
	})
	if err != nil {
		t.Fatalf("JobJSONChanges: %v", err)
	}

	wsDoc := documentFromChanges(t, deliver(t, cipher, "changed", changed))

	for _, path := range parityRows {
		compareRow(t, apiShape(t, job, cipher), wsDoc, path, "a delta")
	}
}

func TestClientPayloadCarriesTheRevisionPairAndClearedRowsUnchanged(t *testing.T) {
	t.Parallel()
	cipher := keys.EntityCipher(t)
	removed := [][]string{{"build", "extrasCosts", "e-1"}}

	envelope, err := json.Marshal(map[string]any{
		"collection": "job_documents",
		"docID":      "job-1",
		"removed":    removed,
		"revision":   8,
		"appliesTo":  7,
	})
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	delivered := decodeJSON(t, ClientPayload(envelope, models.AccountOwner("acct-parity"), cipher, 0))

	if delivered["revision"] != float64(8) || delivered["appliesTo"] != float64(7) {
		t.Errorf("want 8 onto 7 delivered, got %v onto %v", delivered["revision"], delivered["appliesTo"])
	}
	cleared, ok := delivered["removed"].([]any)
	if !ok || len(cleared) != 1 {
		t.Fatalf("want the cleared row delivered, got %v", delivered["removed"])
	}
	if path, _ := cleared[0].([]any); len(path) != 3 || path[2] != "e-1" {
		t.Errorf("want the cleared path unchanged, got %v", cleared[0])
	}
}

var parityRows = [][]string{
	{"esi", "industryJobs"},
	{"esi", "transactions"},
}

func parityJob(t *testing.T, cipher *entityid.Cipher) *models.Job {
	t.Helper()
	job := &models.Job{JobID: "job-1"}
	job.ESI.Transactions = map[string]models.Transaction{
		"77": {TransactionID: 77, CorporationID: 98765432, CharacterID: 91234567},
	}
	job.ESI.LinkedJobs = map[string]models.LinkedESIJob{
		"512345678": {JobID: 512345678, CorporationID: 98765432},
	}
	if err := jobidentity.Encrypt(job, cipher); err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	return job
}

func apiShape(t *testing.T, job *models.Job, cipher *entityid.Cipher) map[string]any {
	t.Helper()
	served := *job
	served.ESI.Transactions = maps.Clone(job.ESI.Transactions)
	served.ESI.LinkedJobs = maps.Clone(job.ESI.LinkedJobs)
	if err := jobidentity.Decrypt(&served, cipher); err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	body, err := json.Marshal(served)
	if err != nil {
		t.Fatalf("marshal api response: %v", err)
	}
	return decodeJSON(t, body)
}

func deliver(t *testing.T, cipher *entityid.Cipher, field string, body any) any {
	t.Helper()
	envelope, err := json.Marshal(map[string]any{
		"collection": "job_documents",
		"docID":      "job-1",
		"accountID":  "acct-1",
		field:        body,
	})
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	delivered := decodeJSON(t, ClientPayload(envelope, models.AccountOwner("acct-parity"), cipher, 0))
	held, ok := delivered[field]
	if !ok {
		t.Fatalf("%q was not delivered in %v", field, delivered)
	}
	return held
}

func documentFromChanges(t *testing.T, delivered any) map[string]any {
	t.Helper()
	changes, ok := delivered.([]any)
	if !ok {
		t.Fatalf("changes are not a list: %v", delivered)
	}
	out := map[string]any{}
	for _, raw := range changes {
		change, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("a change is not an object: %v", raw)
		}
		steps, _ := change["path"].([]any)
		at := out
		for i, step := range steps {
			name, _ := step.(string)
			if i == len(steps)-1 {
				at[name] = change["value"]
				break
			}
			next, ok := at[name].(map[string]any)
			if !ok {
				next = map[string]any{}
				at[name] = next
			}
			at = next
		}
	}
	return out
}

func compareRow(t *testing.T, apiDoc, wsDoc map[string]any, path []string, over string) {
	t.Helper()
	apiRows := rowsAt(t, apiDoc, path)
	wsRows := rowsAt(t, wsDoc, path)

	if !slices.Equal(sortedKeys(apiRows), sortedKeys(wsRows)) {
		t.Errorf("%v over %s: rows are keyed %v, and %v over the API",
			path, over, sortedKeys(wsRows), sortedKeys(apiRows))
		return
	}

	apiLine := firstLine(t, apiRows, path)
	wsLine := firstLine(t, wsRows, path)

	for key, want := range apiLine {
		if key == "timeStamps" {
			continue
		}
		got, present := wsLine[key]
		if !present {
			t.Errorf("%v over %s: missing %q, which the API response carries (keys: %v)",
				path, over, key, sortedKeys(wsLine))
			continue
		}
		if isEntityKey(key) && got != want {
			t.Errorf("%v over %s: %q = %v, and %v over the API", path, over, key, got, want)
		}
	}
	for key := range wsLine {
		if _, present := apiLine[key]; !present {
			t.Errorf("%v over %s: carries %q, which the API response does not (api keys: %v)",
				path, over, key, sortedKeys(apiLine))
		}
	}
}

func storedExtJSON(t *testing.T, job *models.Job) []byte {
	t.Helper()
	out, err := bson.MarshalExtJSON(job, false, false)
	if err != nil {
		t.Fatalf("marshal stored document: %v", err)
	}
	return out
}

func storedDocument(t *testing.T, job *models.Job) bson.M {
	t.Helper()
	raw, err := bson.Marshal(job)
	if err != nil {
		t.Fatalf("marshal stored document: %v", err)
	}
	var out bson.M
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal stored document: %v", err)
	}
	return out
}

func rowAt(t *testing.T, document bson.M, path ...string) any {
	t.Helper()
	var held any = document
	for _, step := range path {
		inner := eipmongo.AsDocumentM(held)
		if inner == nil {
			t.Fatalf("nothing to step into at %q, which is %T", step, held)
		}
		value, ok := inner[step]
		if !ok {
			t.Fatalf("no %q in the stored document", step)
		}
		held = value
	}
	return held
}

func isEntityKey(key string) bool {
	return key == "corporation_id" || key == "character_id" || key == "alliance_id"
}

func decodeJSON(t *testing.T, b []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("decode: %v\n%s", err, b)
	}
	return m
}

func rowsAt(t *testing.T, doc map[string]any, path []string) map[string]any {
	t.Helper()
	var node any = doc
	for _, step := range path {
		m, ok := node.(map[string]any)
		if !ok {
			t.Fatalf("path %v: %q is not an object", path, step)
		}
		node = m[step]
	}
	rows, ok := node.(map[string]any)
	if !ok || len(rows) == 0 {
		t.Fatalf("path %v: expected a non-empty object, got %T", path, node)
	}
	return rows
}

func firstLine(t *testing.T, rows map[string]any, path []string) map[string]any {
	t.Helper()
	line, ok := rows[slices.Min(sortedKeys(rows))].(map[string]any)
	if !ok {
		t.Fatalf("path %v: the first row is not an object", path)
	}
	return line
}

func sortedKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	slices.Sort(out)
	return out
}
