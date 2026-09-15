package server

import (
	"context"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// waitForScope blocks until a connection is receiving the planner it named. The
// switch is applied on the connection's own goroutine, so a publish racing it
// would be a flake rather than a failure.
func (f *integFixture) waitForScope(clientID string, owner models.Owner, timeout time.Duration) {
	f.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.scopesOf(clientID).Has(owner) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	f.t.Fatalf("client %q never took the planner %s", clientID, owner.Key())
}

// The stage's headline, end to end: a lock event for a planner reaches every
// member working in it, not one account's tabs.
//
// The unit tests prove two members meet on one Redis key. This proves the other
// half — that the event crosses the process boundary addressed by the planner —
// which no unit can see: the API publishes on doc.lock.{ownerKey}, the JetStream
// filter has to admit that subject, and delivery has to resolve it back to the
// set of connections working in that planner.
func TestDocLockReachesEveryMemberOfAPlanner(t *testing.T) {
	f := newIntegFixture(t)
	planner := corpOwner(t, wsTestCorpIDA)

	f.seedSessionWithGrants("acct-ann", "sess-ann", []int64{wsTestCorpIDA}, nil)
	f.seedSessionWithGrants("acct-bo", "sess-bo", []int64{wsTestCorpIDA}, nil)
	nats := f.withDocLockDelivery()

	annConn, annID := f.connectTab("sess-ann")
	boConn, boID := f.connectTab("sess-bo")
	f.waitClients(2, 2*time.Second)

	// Each member names the planner they are working in, which is what the lock
	// paths read — a connection's scopes hold every planner it may reach.
	handle := corpHandle(wsTestCorpIDA)
	f.writeJSON(annConn, activePlannerMessage{Type: "active_planner", Owner: handle})
	f.writeJSON(boConn, activePlannerMessage{Type: "active_planner", Owner: handle})
	f.waitForScope(annID, planner, 2*time.Second)
	f.waitForScope(boID, planner, 2*time.Second)
	// The consumer's filters follow the hosted tenants on a debounce; applied here
	// rather than waited on, so the publish below cannot race it.
	f.Server.reconcileDocFanoutFilters(context.Background())

	if err := documentlock.PublishDocLockNotification(context.Background(), nats, planner, map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockEventAcquired,
		"collection":                     "job_documents",
		"docID":                          "job-shared",
		"sessionID":                      "sess-ann",
	}); err != nil {
		t.Fatalf("PublishDocLockNotification: %v", err)
	}

	for name, conn := range map[string]*websocket.Conn{"ann": annConn, "bo": boConn} {
		msg := f.readJSONOfType(conn, eipnats.ClientMessageDocumentLock, 5*time.Second)
		if got, _ := msg["event"].(string); got != documentlock.LockEventAcquired {
			t.Errorf("%s: event=%v msg=%v", name, msg["event"], msg)
		}
		if got, _ := msg["docID"].(string); got != "job-shared" {
			t.Errorf("%s: docID=%v", name, msg["docID"])
		}
	}
}

// A planner's lock events stop at its members. An account that holds no
// membership row is not in the planner's pool, so nothing addresses it.
func TestDocLockDoesNotReachANonMember(t *testing.T) {
	f := newIntegFixture(t)
	planner := corpOwner(t, wsTestCorpIDA)

	f.seedSessionWithGrants("acct-ann", "sess-ann", []int64{wsTestCorpIDA}, nil)
	// Granted a different corporation, so its own planner and not this one.
	f.seedSessionWithGrants("acct-cass", "sess-cass", []int64{wsTestCorpIDB}, nil)
	nats := f.withDocLockDelivery()

	annConn, annID := f.connectTab("sess-ann")
	cassConn, _ := f.connectTab("sess-cass")
	f.waitClients(2, 2*time.Second)

	f.writeJSON(annConn, activePlannerMessage{Type: "active_planner", Owner: corpHandle(wsTestCorpIDA)})
	f.waitForScope(annID, planner, 2*time.Second)
	f.Server.reconcileDocFanoutFilters(context.Background())

	if err := documentlock.PublishDocLockNotification(context.Background(), nats, planner, map[string]any{
		documentlock.LockPayloadEventKey: documentlock.LockEventAcquired,
		"collection":                     "job_documents",
		"docID":                          "job-shared",
		"sessionID":                      "sess-ann",
	}); err != nil {
		t.Fatalf("PublishDocLockNotification: %v", err)
	}

	// The member receives it, which is what makes the silence below meaningful
	// rather than a publish that never happened.
	f.readJSONOfType(annConn, eipnats.ClientMessageDocumentLock, 5*time.Second)

	if msg, ok := f.readJSONMessageIfAny(cassConn, 500*time.Millisecond); ok {
		if got, _ := msg["type"].(string); got == eipnats.ClientMessageDocumentLock {
			t.Fatalf("a non-member received the planner's lock event: %v", msg)
		}
	}
}
