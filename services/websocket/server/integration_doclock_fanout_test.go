package server

import (
	"context"
	"encoding/json"
	"eve-industry-planner/shared/models"
	"testing"
	"time"

	"eve-industry-planner/shared/core/documentlock"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/gorilla/websocket"
)

// lockWire builds the frame the doc.lock adapter would hand to delivery.
func lockWire(t *testing.T, inner map[string]any) (wire []byte, suppressSessionID string) {
	t.Helper()
	raw, err := json.Marshal(inner)
	if err != nil {
		t.Fatal(err)
	}
	wire, suppressSessionID, err = natslogic.BuildDocumentLockWire(raw)
	if err != nil {
		t.Fatal(err)
	}
	return wire, suppressSessionID
}

// Delivery half of nats_doc_lock: BuildDocumentLockWire plus the adapter (the
// JetStream subscribe still needs a live NATS in the fixture).
func TestIntegrationDocLockFanoutReachesEveryTabOfTheAccount(t *testing.T) {
	f := newIntegFixture(t)
	const accountID = "acct-fanout"

	f.seedSession(accountID, "sess-fan-a")
	connA := f.dial("sess-fan-a")
	_ = f.readJSONMessage(connA, 2*time.Second)

	f.seedSession(accountID, "sess-fan-b")
	connB := f.dial("sess-fan-b")
	_ = f.readJSONMessage(connB, 2*time.Second)
	f.waitClients(2, 2*time.Second)

	// A lock request names the requester's session, and is deliberately not
	// suppressed: that id is shared by every tab, so suppressing it would skip the
	// tab that asked for the lock as well.
	wire, suppress := lockWire(t, map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockEventRequested,
		"collection":                     "jobs",
		"docID":                          "job-fan",
		"requesterSessionID":             "sess-fan-a",
	})
	if suppress != "" {
		t.Fatalf("requested event should not suppress, got %q", suppress)
	}

	outcome := f.Server.deliverDocumentLock(models.AccountOwner(accountID), wire, suppress)
	if outcome.RecipientCount < 2 {
		t.Fatalf("recipients=%d want >=2 outcome=%+v", outcome.RecipientCount, outcome)
	}
	if outcome.Family != eipnats.ClientMessageDocumentLock {
		t.Fatalf("family=%q want %q", outcome.Family, eipnats.ClientMessageDocumentLock)
	}

	for i, conn := range []*websocket.Conn{connA, connB} {
		msg := f.readJSONOfType(conn, eipnats.ClientMessageDocumentLock, 2*time.Second)
		if got, _ := msg["event"].(string); got != documentlock.LockEventRequested {
			t.Fatalf("conn[%d] event=%v msg=%v", i, msg["event"], msg)
		}
		if got, _ := msg["docID"].(string); got != "job-fan" {
			t.Fatalf("conn[%d] docID=%v", i, msg["docID"])
		}
	}
}

// A viewer event is not sent back to the session that caused it. It is the one
// lock event that suppresses, and the suppression is by session rather than by
// tab, so every tab of that session is skipped.
func TestIntegrationDocLockViewerEventSkipsTheSessionThatCausedIt(t *testing.T) {
	f := newIntegFixture(t)
	const accountID = "acct-viewer"

	f.seedSession(accountID, "sess-viewer-src")
	src := f.dial("sess-viewer-src")
	_ = f.readJSONMessage(src, 2*time.Second)

	f.seedSession(accountID, "sess-viewer-other")
	other := f.dial("sess-viewer-other")
	_ = f.readJSONMessage(other, 2*time.Second)
	f.waitClients(2, 2*time.Second)

	wire, suppress := lockWire(t, map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockViewerEventJoined,
		"collection":                     "jobs",
		"docID":                          "job-viewer",
		"sessionID":                      "sess-viewer-src",
	})
	if suppress != "sess-viewer-src" {
		t.Fatalf("viewer event should suppress its session, got %q", suppress)
	}

	outcome := f.Server.deliverDocumentLock(models.AccountOwner(accountID), wire, suppress)
	if outcome.RecipientCount != 1 {
		t.Fatalf("recipients=%d want 1 outcome=%+v", outcome.RecipientCount, outcome)
	}
	if len(outcome.SkippedEchoClientIDs) != 1 {
		t.Fatalf("echo skips=%v want one outcome=%+v", outcome.SkippedEchoClientIDs, outcome)
	}

	msg := f.readJSONOfType(other, eipnats.ClientMessageDocumentLock, 2*time.Second)
	if got, _ := msg["docID"].(string); got != "job-viewer" {
		t.Fatalf("docID=%v", msg["docID"])
	}
	if extra, ok := f.readJSONMessageIfAny(src, 300*time.Millisecond); ok {
		t.Fatalf("source session was sent %v", extra)
	}
}

// The whole lock path, from the subject the API publishes on to the frame a
// browser reads: JetStream consumer, adapter, walk, socket.
func TestIntegrationDocLockReachesASocketFromTheSubject(t *testing.T) {
	f := newIntegFixture(t)
	const accountID = "acct-lock-e2e"

	conn := f.connectAccount(accountID, "sess-lock-e2e")
	nats := f.withDocLockDelivery()

	if err := documentlock.PublishDocLockNotification(context.Background(), nats, models.AccountOwner(accountID), map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockEventRequested,
		"collection":                     "jobs",
		"docID":                          "job-e2e",
		"requesterSessionID":             "sess-lock-e2e",
	}); err != nil {
		t.Fatalf("PublishDocLockNotification: %v", err)
	}

	msg := f.readJSONOfType(conn, eipnats.ClientMessageDocumentLock, 5*time.Second)
	if got, _ := msg["event"].(string); got != documentlock.LockEventRequested {
		t.Fatalf("event=%v msg=%v", msg["event"], msg)
	}
	if got, _ := msg["docID"].(string); got != "job-e2e" {
		t.Fatalf("docID=%v", msg["docID"])
	}
}
