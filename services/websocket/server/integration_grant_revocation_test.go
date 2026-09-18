package server

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/wait"
)

// A member removed from a planner stops receiving it without reconnecting.
//
// The connection's scopes are derived once, at connect, so this is the only path
// that reaches a session already open — every other surface reads the stored
// record, which is correct the moment the rows change.
func TestIntegrationGrantsNarrowOnAnOpenConnection(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-revoke"
		sessionID = "sess-revoke"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	_, clientID := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	if !f.scopesOf(clientID).Has(corp) {
		t.Fatalf("scopes = %v, want the corporation the session was granted", f.scopesOf(clientID))
	}

	f.Server.applySessionGrantsChanged(context.Background(), eipnats.SessionGrantsChanged{
		AccountID: accountID,
		Granted:   nil,
	})

	scopes := f.scopesOf(clientID)
	if scopes.Has(corp) {
		t.Fatalf("scopes = %v, still carrying the planner the account was removed from", scopes)
	}
	// The account's own planner is not a grant and is never withdrawn.
	if !scopes.Has(models.AccountOwner(accountID)) {
		t.Fatalf("scopes = %v, want the account's own planner kept", scopes)
	}
	if slices.Contains(f.Server.ownerPoolKeys(), corp.Key()) {
		t.Fatalf("the routing index still pools %s", corp.Key())
	}
}

// A ceiling that still carries the planner leaves the connection alone, so an
// unrelated account's change cannot narrow it.
func TestIntegrationGrantsUnchangedLeaveScopesAlone(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-revoke-noop"
		sessionID = "sess-revoke-noop"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	_, clientID := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	before := f.scopesOf(clientID)
	corp := models.CorporationOwner(wsTestCorpRef(t, 10))

	f.Server.applySessionGrantsChanged(context.Background(), eipnats.SessionGrantsChanged{
		AccountID: "someone-else",
		Granted:   nil,
	})

	after := f.scopesOf(clientID)
	if len(after) != len(before) || !after.Has(corp) {
		t.Fatalf("scopes = %v, want %v untouched by another account's change", after, before)
	}
}

// The announcement arrives on the subscription's goroutine while the connection
// is reading its own messages on another, so the two touch one client's ceiling
// at once. Driven concurrently rather than in turn because a data race is only
// visible to the detector when both goroutines actually run together.
func TestIntegrationGrantsNarrowWhileThePlannerIsBeingSwitched(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-revoke-race"
		sessionID = "sess-revoke-race"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	conn, _ := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	granted := models.NewOwnerKeys().Add(corp).Normalized()

	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		for range 50 {
			f.Server.applySessionGrantsChanged(context.Background(), eipnats.SessionGrantsChanged{
				AccountID: accountID,
				Granted:   granted,
			})
		}
	}()
	go func() {
		defer wg.Done()
		for range 50 {
			f.writeJSON(conn, map[string]any{
				"type":  "active_planner",
				"owner": "corporation:10",
			})
		}
	}()
	// Delivery reads the same scopes from a third goroutine, which is where the
	// fan-out decides whether this connection is a recipient.
	go func() {
		defer wg.Done()
		for range 50 {
			f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.race",
				docUpdateFor(t, corp, "race-doc"), 0)
		}
	}()
	wg.Wait()

	// The ceiling never narrowed, so the planner survives every interleaving.
	f.waitClients(1, 2*time.Second)
}

// The whole path, from the call a worker makes to the scopes a connection holds.
//
// The tests above call the handler directly, which proves what it does and
// nothing about how it is reached. A subject that does not match, an envelope
// that does not round-trip, or a subscription never started at boot would leave
// every one of them passing while no revocation ever arrived.
func TestIntegrationGrantsChangePublishedByAWorkerNarrowsAConnection(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-revoke-e2e"
		sessionID = "sess-revoke-e2e"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)
	nats := f.withSessionGrantsDelivery()

	_, clientID := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	if !f.scopesOf(clientID).Has(corp) {
		t.Fatalf("scopes = %v, want the corporation the session was granted", f.scopesOf(clientID))
	}

	// What WriteSessionGrantsFromMemberships publishes once the rows are gone.
	if err := eipnats.PublishSessionGrantsChanged(nats, accountID, nil); err != nil {
		t.Fatalf("publish grants change: %v", err)
	}

	wait.For(t, 2*time.Second, func() (bool, string) {
		scopes := f.scopesOf(clientID)
		return !scopes.Has(corp), "connection still holds the revoked planner"
	})
	if !f.scopesOf(clientID).Has(models.AccountOwner(accountID)) {
		t.Fatalf("scopes = %v, want the account's own planner kept", f.scopesOf(clientID))
	}
}
