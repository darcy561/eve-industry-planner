package server

import (
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/gorilla/websocket"
)

// Delivery half of nats_doc_lock: BuildDocumentLockWire + broadcastRawToAccount
// (JetStream subscribe still needs a live NATS in the fixture).
func TestIntegrationDocLockFanoutBroadcastsToAccount(t *testing.T) {
	f := newIntegFixture(t)
	const accountID = "acct-fanout"

	f.seedSession(accountID, "sess-fan-a")
	connA := f.dial("sess-fan-a")
	_ = f.readJSONMessage(connA, 2*time.Second)

	f.seedSession(accountID, "sess-fan-b")
	connB := f.dial("sess-fan-b")
	_ = f.readJSONMessage(connB, 2*time.Second)
	f.waitClients(2, 2*time.Second)

	inner, err := json.Marshal(map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockEventRequested,
		"collection":                     "jobs",
		"docID":                          "job-fan",
		"requesterSessionID":             "sess-fan-a",
	})
	if err != nil {
		t.Fatal(err)
	}
	wire, suppress, err := natslogic.BuildDocumentLockWire(inner)
	if err != nil {
		t.Fatal(err)
	}
	if suppress != "" {
		t.Fatalf("requested event should not suppress, got %q", suppress)
	}

	outcome := f.Server.broadcastRawToAccount(accountID, wire, suppress)
	if outcome.RecipientCount < 2 {
		t.Fatalf("recipients=%d want >=2 outcome=%+v", outcome.RecipientCount, outcome)
	}

	for i, conn := range []*websocket.Conn{connA, connB} {
		msg := f.readJSONOfType(conn, "document_lock", 2*time.Second)
		if got, _ := msg["event"].(string); got != documentlock.LockEventRequested {
			t.Fatalf("conn[%d] event=%v msg=%v", i, msg["event"], msg)
		}
		if got, _ := msg["docID"].(string); got != "job-fan" {
			t.Fatalf("conn[%d] docID=%v", i, msg["docID"])
		}
	}
}
