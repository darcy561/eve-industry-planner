package server

import (
	"context"
	"testing"
	"time"

	"eve-industry-planner/shared/models"

	"github.com/gorilla/websocket"
)

// The position a change is delivered with, over real sockets to more than one
// account.
//
// It is what a client compares against to tell a change it has not seen from a
// copy of one it has, and what a resume will be answered from. Both properties
// rest on every recipient of one change being told the same number, which only a
// fan-out to separate connections can show.

// Two members of a planner are told the same change, and they are told the same
// position for it. A number that differed per recipient would leave two members
// unable to describe the same point in the planner's history.
func TestIntegrationEveryMemberIsToldTheSamePosition(t *testing.T) {
	f := newIntegFixture(t)
	const corpID = 20
	f.seedSessionWithGrants("acct-pos-one", "sess-pos-one", []int64{corpID}, nil)
	f.seedSessionWithGrants("acct-pos-two", "sess-pos-two", []int64{corpID}, nil)
	// In the same corporation, and so reachable by the same owner key, but not a
	// member of the planner being written to.
	f.seedSessionWithGrants("acct-pos-outside", "sess-pos-outside", nil, nil)

	member, _ := f.connectTab("sess-pos-one")
	sibling, _ := f.connectTab("sess-pos-two")
	outsider, _ := f.connectTab("sess-pos-outside")
	f.waitClients(3, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, corpID))
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.shared",
		docUpdateFrom(t, corp, "shared-doc", "", ""), 4242)

	for _, read := range []struct {
		name string
		conn *websocket.Conn
	}{
		{"the member", member},
		{"its sibling", sibling},
	} {
		name := read.name
		got := f.readJSONMessage(read.conn, 2*time.Second)
		if got["docID"] != "shared-doc" {
			t.Fatalf("%s received %v, want the changed document", name, got)
		}
		if got["position"] != float64(4242) {
			t.Fatalf("%s was told position %v, want 4242", name, got["position"])
		}
	}

	if got, ok := f.readJSONMessageIfAny(outsider, 300*time.Millisecond); ok {
		t.Fatalf("an account outside the planner was told %v", got)
	}
}

// Positions advance with the stream, so a client reading in order sees them
// increase. This is what makes "everything after mine" a question the client can
// ask, which is what a resume answers.
func TestIntegrationPositionsArriveInOrder(t *testing.T) {
	f := newIntegFixture(t)
	const corpID = 21
	f.seedSessionWithGrants("acct-pos-order", "sess-pos-order", []int64{corpID}, nil)

	reader, _ := f.connectTab("sess-pos-order")
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, corpID))
	for _, position := range []uint64{11, 12, 13} {
		f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.ordered",
			docUpdateFrom(t, corp, "ordered-doc", "", ""), position)
	}

	for _, want := range []float64{11, 12, 13} {
		got := f.readJSONMessage(reader, 2*time.Second)
		if got["position"] != want {
			t.Fatalf("read position %v, want %v", got["position"], want)
		}
	}
}

// A redelivery is the same message a second time, so it carries the position it
// carried before. The client discards it on that; the server's part is not to
// invent a new number for it.
func TestIntegrationARedeliveryRepeatsItsPosition(t *testing.T) {
	f := newIntegFixture(t)
	const corpID = 22
	f.seedSessionWithGrants("acct-pos-again", "sess-pos-again", []int64{corpID}, nil)

	reader, _ := f.connectTab("sess-pos-again")
	f.waitClients(1, 2*time.Second)

	corp := models.CorporationOwner(wsTestCorpRef(t, corpID))
	frame := docUpdateFrom(t, corp, "repeated-doc", "", "")
	for range 2 {
		f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.repeated", frame, 99)
	}

	for range 2 {
		got := f.readJSONMessage(reader, 2*time.Second)
		if got["position"] != float64(99) {
			t.Fatalf("a redelivery was given position %v, want the original 99", got["position"])
		}
	}
}
