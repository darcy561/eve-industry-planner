package server

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	"eve-industry-planner/shared/plannersession"
	"eve-industry-planner/testing/wait"
)

// Owner grants, end to end.
//
// The per-package tests each prove one link: that grants store owner keys, that
// the ceiling refuses what it does not hold, that the index routes by owner. These
// prove the links hold together over a real socket — a grant written on the server
// reaching, or not reaching, a browser.

// seedLegacyGrants writes the grant shape stored before owner keys, which is what
// a session record holds when a release finds it.
func (f *integFixture) seedLegacyGrants(accountID string, corpRefs, allianceRefs []string) {
	f.t.Helper()
	key := plannersession.AccountSessionsKeyPrefix + accountID
	var record map[string]any
	existing, err := f.Redis.Driver().Get(context.Background(), key).Bytes()
	if err == nil {
		if err := json.Unmarshal(existing, &record); err != nil {
			f.t.Fatalf("seedLegacyGrants read: %v", err)
		}
	} else {
		record = map[string]any{"account_id": accountID, "sessions": map[string]any{}}
	}
	record["grants"] = map[string]any{
		"corporation_refs": corpRefs,
		"alliance_refs":    allianceRefs,
	}
	payload, err := json.Marshal(record)
	if err != nil {
		f.t.Fatalf("seedLegacyGrants marshal: %v", err)
	}
	if err := f.Redis.Driver().Set(context.Background(), key, payload, plannersession.SessionTTL).Err(); err != nil {
		f.t.Fatalf("seedLegacyGrants: %v", err)
	}
}

// grantedOwners reads back what a session record now holds.
func (f *integFixture) grantedOwners(accountID string) models.OwnerKeys {
	f.t.Helper()
	rec, err := plannersession.NewStore(f.Redis).LiveAccountRecord(context.Background(), accountID)
	if err != nil {
		f.t.Fatalf("grantedOwners: %v", err)
	}
	return rec.Grants.OwnerKeys
}

// A grant written from ESI ids has to survive as far as a document arriving in a
// browser: the fill, the ceiling at connect, the upgrade, the index and the
// delivery gate all agreeing on one owner.
func TestIntegrationGrantedOwnerReachesTheBrowser(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-e2e-granted"
		sessionID = "sess-e2e-granted"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)

	conn := f.dial(sessionID)
	_ = f.readJSONMessage(conn, 2*time.Second)
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	wait.For(t, 2*time.Second, func() (bool, string) {
		ok := f.Server.HostsTenant(corp.Key())
		return ok, fmt.Sprintf("hosted = %v, want %s", f.Server.HostedTenants(), corp.Key())
	})

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.e2e",
		docUpdateFor(t, corp, "e2e-doc"), 0)

	got := f.readJSONMessage(conn, 2*time.Second)
	if got["docID"] != "e2e-doc" {
		t.Fatalf("delivered = %v, want the corporation's document", got)
	}
}

// The ceiling is what stands between a client and another owner's documents, so
// asking for one the session was never granted must reach nothing at all.
func TestIntegrationOwnerOutsideTheCeilingReachesNothing(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-e2e-refused"
		sessionID = "sess-e2e-refused"
	)
	// Granted corporation 10 and nothing else.
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)

	conn := f.dial(sessionID)
	_ = f.readJSONMessage(conn, 2*time.Second)
	f.waitClients(1, 2*time.Second)

	ungranted := models.CorporationOwner(wsTestCorpRef(t, 11))
	if f.Server.HostsTenant(ungranted.Key()) {
		t.Fatalf("hosted = %v, must not host an ungranted owner", f.Server.HostedTenants())
	}

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.refused",
		docUpdateFor(t, ungranted, "refused-doc"), 0)

	if got, ok := f.readJSONMessageIfAny(conn, 300*time.Millisecond); ok {
		t.Fatalf("a client outside the ceiling received %v", got)
	}
}

// A record written by the previous release holds no owner keys, so without the
// repair a reconnecting account silently loses every organisation scope. This is
// the release step and the socket proving they meet.
func TestIntegrationRepairedGrantsRestoreScopeOnReconnect(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-e2e-repair"
		sessionID = "sess-e2e-repair"
	)
	corpRef := wsTestCorpRef(t, 10)
	// The session first, then the legacy grants over it: any write through the
	// record's own helpers decodes into the current shape and drops the previous
	// one, so a legacy record only survives being written last.
	f.seedSession(accountID, sessionID)
	f.seedLegacyGrants(accountID, []string{corpRef}, nil)

	// Before the repair the stored grants name no owner at all.
	if held := f.grantedOwners(accountID); len(held) != 0 {
		t.Fatalf("grants before repair = %v, want none readable", held)
	}

	report, err := plannersession.NewStore(f.Redis).RepairGrants(context.Background(), false)
	if err != nil {
		t.Fatalf("RepairSessionGrants: %v", err)
	}
	if report.Repaired != 1 {
		t.Fatalf("repair report = %+v, want one record rewritten", report)
	}

	corp := models.CorporationOwner(corpRef)
	if held := f.grantedOwners(accountID); !held.Has(corp) || !held.Has(models.AccountOwner(accountID)) {
		t.Fatalf("grants after repair = %v, want the corporation and the account's own key", held)
	}

	// A connection made after the repair derives the repaired ceiling.
	conn := f.dial(sessionID)
	_ = f.readJSONMessage(conn, 2*time.Second)
	f.waitClients(1, 2*time.Second)

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.repaired",
		docUpdateFor(t, corp, "repaired-doc"), 0)

	got := f.readJSONMessage(conn, 2*time.Second)
	if got["docID"] != "repaired-doc" {
		t.Fatalf("delivered = %v, want the repaired corporation's document", got)
	}
}
