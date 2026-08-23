package outgoinglogic

import (
	"encoding/json"
	"slices"
	"testing"

	"eve-industry-planner/shared/jobidentity"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/testing/keys"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// A client reads the same document over two transports: an API response and a
// doc.update push. Both must name the entity id identically, or the SPA sees one
// shape on load and a different one on every live update.
//
// The API name comes from the model's json tag; the websocket name is derived
// from the stored bson key. This asserts the derivation lands on the tag.
func TestClientPayloadKeysMatchTheAPIResponse(t *testing.T) {
	t.Parallel()
	cipher := keys.EntityCipher(t)

	job := &models.Job{JobID: "job-1"}
	job.Build.Sale.Transactions = []models.Transaction{{TransactionID: 77, CorporationID: 98765432, CharacterID: 91234567}}
	job.Build.Costs.LinkedJobs = []models.LinkedESIJob{{JobID: 512345678, CorporationID: 98765432}}
	if err := jobidentity.Encrypt(job, cipher); err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	// What the API serves: the stored document with ids restored.
	served := *job
	if err := jobidentity.Decrypt(&served, cipher); err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	apiBody, err := json.Marshal(served)
	if err != nil {
		t.Fatalf("marshal api response: %v", err)
	}
	apiDoc := decodeJSON(t, apiBody)

	// What the websocket delivers: the stored document through ClientPayload,
	// exactly as the changestream copies it out of Mongo.
	storedBSON, err := bson.MarshalExtJSON(job, false, false)
	if err != nil {
		t.Fatalf("marshal stored document: %v", err)
	}
	envelope, err := json.Marshal(map[string]any{
		"collection": "user_job_documents",
		"docID":      "job-1",
		"accountID":  "acct-1",
		"document":   json.RawMessage(storedBSON),
	})
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	wsDoc := decodeJSON(t, ClientPayload(envelope, cipher))["document"].(map[string]any)

	for _, path := range [][]string{
		{"build", "costs", "linkedJobs"},
		{"build", "sale", "transactions"},
	} {
		apiLine := firstLine(t, apiDoc, path)
		wsLine := firstLine(t, wsDoc, path)

		for key, want := range apiLine {
			if key == "timeStamps" {
				continue
			}
			got, present := wsLine[key]
			if !present {
				t.Errorf("%v: websocket payload is missing %q, which the API response carries (ws keys: %v)",
					path, key, sortedKeys(wsLine))
				continue
			}
			if isEntityKey(key) && got != want {
				t.Errorf("%v: %q = %v over websocket, %v over the API", path, key, got, want)
			}
		}
		for key := range wsLine {
			if _, present := apiLine[key]; !present {
				t.Errorf("%v: websocket payload carries %q, which the API response does not (api keys: %v)",
					path, key, sortedKeys(apiLine))
			}
		}
	}
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

func firstLine(t *testing.T, doc map[string]any, path []string) map[string]any {
	t.Helper()
	var node any = doc
	for _, step := range path {
		m, ok := node.(map[string]any)
		if !ok {
			t.Fatalf("path %v: %q is not an object", path, step)
		}
		node = m[step]
	}
	lines, ok := node.([]any)
	if !ok || len(lines) == 0 {
		t.Fatalf("path %v: expected a non-empty array, got %T", path, node)
	}
	line, ok := lines[0].(map[string]any)
	if !ok {
		t.Fatalf("path %v: first element is not an object", path)
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
