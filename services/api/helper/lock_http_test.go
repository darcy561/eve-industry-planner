package helper

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"eve-industry-planner/shared/core/documentlock"
)

func decodeLockBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body
}

// A batch that wrote part of itself still answers 409 — it did not do what it
// was asked — but `saved` is what stops the client reading that as nothing
// happened and re-sending the jobs that landed.
func TestPartialLockConflictReportsWhatWasWritten(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/v1/job-documents", nil)

	RespondPartialLockHeldElsewhereJSON(rec, req, "job_documents", 3,
		[]documentlock.LockHeldElsewhereItem{{DocID: "job-held"}})

	if rec.Code != 409 {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	body := decodeLockBody(t, rec)
	if body["saved"] != float64(3) {
		t.Fatalf("saved = %v, want 3", body["saved"])
	}
	rejected, ok := body["rejected"].([]any)
	if !ok || len(rejected) != 1 {
		t.Fatalf("rejected = %v, want the one held job", body["rejected"])
	}
	if rejected[0].(map[string]any)["docID"] != "job-held" {
		t.Fatalf("rejected = %v, want the held job named", rejected[0])
	}
}

// The whole-batch refusal keeps its shape and says nothing was written, so a
// client that meets it does not have to guess.
func TestWholeBatchLockConflictSavesNothing(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/v1/job-documents", nil)

	RespondLockHeldElsewhereJSON(rec, req, "job_documents",
		[]documentlock.LockHeldElsewhereItem{{DocID: "job-held"}})

	body := decodeLockBody(t, rec)
	if body["saved"] != float64(0) {
		t.Fatalf("saved = %v, want 0", body["saved"])
	}
}
