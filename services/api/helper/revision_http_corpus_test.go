package helper

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

const writeConflictCorpusPath = "../../../testing/fixtures/write-conflict/body.json"

// The 409 body as the corpus states it, which the SPA reads from the same file.
type writeConflictCorpus struct {
	ErrorCodes struct {
		RevisionConflict  string `json:"revisionConflict"`
		LockHeldElsewhere string `json:"lockHeldElsewhere"`
	} `json:"errorCodes"`
	Body struct {
		Error      string `json:"error"`
		Collection string `json:"collection"`
		Saved      int    `json:"saved"`
		Rejected   []struct {
			DocID    string `json:"docID"`
			Expected int64  `json:"expected"`
			Current  int64  `json:"current"`
			Gone     bool   `json:"gone"`
		} `json:"rejected"`
	} `json:"body"`
}

func mustReadCorpus(t *testing.T) []byte {
	t.Helper()
	raw, err := os.ReadFile(writeConflictCorpusPath)
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	return raw
}

func loadWriteConflictCorpus(t *testing.T) writeConflictCorpus {
	t.Helper()
	raw := mustReadCorpus(t)
	var corpus writeConflictCorpus
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	return corpus
}

// The error code is the discriminator the client tells a revision conflict from
// a lock conflict on, so it is stated once and read by both sides.
func TestRevisionConflictCodeMatchesTheCorpus(t *testing.T) {
	corpus := loadWriteConflictCorpus(t)
	if ErrCodeRevisionConflict != corpus.ErrorCodes.RevisionConflict {
		t.Fatalf("error code = %q, corpus says %q",
			ErrCodeRevisionConflict, corpus.ErrorCodes.RevisionConflict)
	}
}

// What the handler writes is compared field by field with what the corpus says a
// client may read. A field renamed here without the corpus fails, and the SPA's
// own corpus test fails for the other half of the same rename.
func TestRevisionConflictBodyMatchesTheCorpus(t *testing.T) {
	corpus := loadWriteConflictCorpus(t)

	conflicts := make([]eipmongo.RevisionConflict, 0, len(corpus.Body.Rejected))
	for _, row := range corpus.Body.Rejected {
		conflicts = append(conflicts, eipmongo.RevisionConflict{
			JobID:    row.DocID,
			Expected: row.Expected,
			Current:  row.Current,
			Gone:     row.Gone,
		})
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/v1/job-documents", nil)
	RespondRevisionConflictJSON(rec, req, corpus.Body.Collection, corpus.Body.Saved, conflicts)

	if rec.Code != 409 {
		t.Fatalf("status = %d, want 409", rec.Code)
	}

	// Compared against the corpus's own JSON rather than against the struct it
	// decoded into: a field renamed in the corpus decodes as empty on both sides
	// and would still match, so re-marshalling the struct proves nothing about
	// the names. The raw keys are the contract.
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	var raw struct {
		Body json.RawMessage `json:"body"`
	}
	if err := json.Unmarshal(mustReadCorpus(t), &raw); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}
	var want map[string]any
	if err := json.Unmarshal(raw.Body, &want); err != nil {
		t.Fatalf("decode corpus body: %v", err)
	}

	gotJSON, _ := json.Marshal(got)
	wantJSON, _ := json.Marshal(want)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("body mismatch\n got: %s\nwant: %s", gotJSON, wantJSON)
	}
}
