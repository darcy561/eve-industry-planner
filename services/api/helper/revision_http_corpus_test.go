package helper

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"

	eipmongo "eve-industry-planner/shared/mongo"
)

const writeConflictCorpusPath = "../../../testing/fixtures/write-conflict/body.json"

type writeConflictCorpus struct {
	ErrorCodes struct {
		RevisionConflict  string `json:"revisionConflict"`
		LockHeldElsewhere string `json:"lockHeldElsewhere"`
	} `json:"errorCodes"`
	Body struct {
		Error       string   `json:"error"`
		Collection  string   `json:"collection"`
		Saved       int      `json:"saved"`
		SavedDocIDs []string `json:"savedDocIDs"`
		Rejected    []struct {
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

func TestRevisionConflictCodeMatchesTheCorpus(t *testing.T) {
	corpus := loadWriteConflictCorpus(t)
	if ErrCodeRevisionConflict != corpus.ErrorCodes.RevisionConflict {
		t.Fatalf("error code = %q, corpus says %q",
			ErrCodeRevisionConflict, corpus.ErrorCodes.RevisionConflict)
	}
}

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
	RespondRevisionConflictJSON(rec, req, corpus.Body.Collection, corpus.Body.Saved, corpus.Body.SavedDocIDs, conflicts)

	if rec.Code != 409 {
		t.Fatalf("status = %d, want 409", rec.Code)
	}

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
