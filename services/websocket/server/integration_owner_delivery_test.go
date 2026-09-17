package server

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
)

// Owner-scoped delivery, end to end.
//
// One walk delivers every owner kind, so what the per-package tests prove about
// it — that the owner check is the whole rule, that the tab which made a change
// is skipped — is proven here over real sockets, against connections whose
// scopes and client ids the server derived rather than the test.

// A change made in one tab must not come back to it, while its sibling tabs are
// told. Both halves matter, and only a real socket proves the second: the id
// delivery suppresses on is the id the server handed the browser in its
// connected frame, and nothing else checks that those are the same id.
func TestIntegrationTheTabThatMadeTheChangeIsNotToldAboutIt(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-e2e-echo"
		sessionID = "sess-e2e-echo"
	)
	f.seedSessionWithGrants(accountID, sessionID, []int64{10}, nil)

	writer, writerID := f.connectTab(sessionID)
	sibling, siblingID := f.connectTab(sessionID)
	f.waitClients(2, 2*time.Second)
	if writerID == siblingID {
		t.Fatalf("both tabs were given the client id %q", writerID)
	}

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.echo",
		docUpdateFrom(t, corp, "echo-doc", writerID, sessionID), 0)

	got := f.readJSONMessage(sibling, 2*time.Second)
	if got["docID"] != "echo-doc" {
		t.Fatalf("the sibling tab received %v, want the changed document", got)
	}
	if echoed, ok := f.readJSONMessageIfAny(writer, 300*time.Millisecond); ok {
		t.Fatalf("the tab that made the change received %v back", echoed)
	}
}

// A write no tab claims — a task, a server-side job — suppresses the session it
// came from and nothing else.
func TestIntegrationAChangeNamingNoTabSuppressesTheWholeSession(t *testing.T) {
	f := newIntegFixture(t)
	const (
		writerAccount  = "acct-e2e-session-writer"
		writerSession  = "sess-e2e-session-writer"
		readerAccount  = "acct-e2e-session-reader"
		readerSessionH = "sess-e2e-session-reader"
	)
	f.seedSessionWithGrants(writerAccount, writerSession, []int64{10}, nil)
	f.seedSessionWithGrants(readerAccount, readerSessionH, []int64{10}, nil)

	writer, _ := f.connectTab(writerSession)
	reader, _ := f.connectTab(readerSessionH)
	f.waitClients(2, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, 10))
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.task",
		docUpdateFrom(t, corp, "task-doc", "", writerSession), 0)

	got := f.readJSONMessage(reader, 2*time.Second)
	if got["docID"] != "task-doc" {
		t.Fatalf("the other member received %v, want the changed document", got)
	}
	if echoed, ok := f.readJSONMessageIfAny(writer, 300*time.Millisecond); ok {
		t.Fatalf("a tab of the originating session received %v back", echoed)
	}
}

// An alliance planner's documents reach a member who holds the alliance and
// nothing under it. Scopes are the account key plus the planner being worked in,
// so there is no corporation key to sit beneath, and delivery must not look for
// one.
func TestIntegrationAllianceOwnerReachesAMemberHoldingNoCorporation(t *testing.T) {
	f := newIntegFixture(t)
	const (
		accountID = "acct-e2e-alliance"
		sessionID = "sess-e2e-alliance"
	)
	f.seedSessionWithGrants(accountID, sessionID, nil, []int64{9})

	conn, clientID := f.connectTab(sessionID)
	f.waitClients(1, 2*time.Second)

	if corps := f.scopesOf(clientID).IDsForKind(models.OwnerCorporation); len(corps) != 0 {
		t.Fatalf("the connection holds corporation keys %v, which this case is about not having", corps)
	}

	ally := models.AllianceOwner(wsTestAllianceRef(t, 9))
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.alliance",
		docUpdateFor(t, ally, "alliance-doc"), 0)

	got := f.readJSONMessage(conn, 2*time.Second)
	if got["docID"] != "alliance-doc" {
		t.Fatalf("delivered = %v, want the alliance's document", got)
	}
}
