package natslogic

import (
	"encoding/json"
	"testing"

	"eve-industry-planner/shared/core/documentlock"
)

func TestBuildDocumentLockWireFlatShape(t *testing.T) {
	raw := []byte(`{"` + documentlock.LockPayloadEventKey + `":"` + documentlock.LockViewerEventJoined + `","sessionID":"sess-a","collection":"user_job_documents","docID":"job-1"}`)
	wire, suppress, err := BuildDocumentLockWire(raw)
	if err != nil {
		t.Fatal(err)
	}
	if suppress != "sess-a" {
		t.Fatalf("suppressSessionID = %q, want sess-a", suppress)
	}
	var outer map[string]any
	if err := json.Unmarshal(wire, &outer); err != nil {
		t.Fatal(err)
	}
	if outer["type"] != "document_lock" {
		t.Fatalf("outer type = %v", outer["type"])
	}
	if _, has := outer["payload"]; has {
		t.Fatal("expected flat wire without payload wrapper")
	}
	if outer[documentlock.LockPayloadEventKey] != documentlock.LockViewerEventJoined {
		t.Fatalf("event = %v", outer[documentlock.LockPayloadEventKey])
	}
}

func TestBuildDocumentLockWireNoSuppressRequested(t *testing.T) {
	raw := []byte(`{"` + documentlock.LockPayloadEventKey + `":"` + documentlock.LockEventRequested + `","requesterSessionID":"req-sess-1","collection":"c","docID":"d"}`)
	_, suppress, err := BuildDocumentLockWire(raw)
	if err != nil {
		t.Fatal(err)
	}
	if suppress != "" {
		t.Fatalf("suppressSessionID = %q, want empty (JWT session shared across tabs)", suppress)
	}
}

func TestBuildDocumentLockWireNoSuppressRequestedMissingRequester(t *testing.T) {
	raw := []byte(`{"` + documentlock.LockPayloadEventKey + `":"` + documentlock.LockEventRequested + `","collection":"c","docID":"d"}`)
	_, suppress, err := BuildDocumentLockWire(raw)
	if err != nil {
		t.Fatal(err)
	}
	if suppress != "" {
		t.Fatalf("expected no suppress without requesterSessionID, got %q", suppress)
	}
}
