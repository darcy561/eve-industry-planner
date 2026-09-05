package server

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/websocket/server/model"
)

// docUpdateFor builds the payload the watcher publishes for an owner.
func docUpdateFor(t *testing.T, owner models.Owner, docID string) []byte {
	t.Helper()
	body := map[string]any{
		"collection":    eipmongo.CollectionJobDocuments,
		"docID":         docID,
		"operationType": "update",
	}
	if !owner.IsZero() {
		body["ownerKey"] = owner.Key()
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// received drains a client's send channel, returning the docIDs it was given.
func received(t *testing.T, c *Client) []string {
	t.Helper()
	var out []string
	for {
		select {
		case raw := <-c.Send:
			var m struct {
				DocID string `json:"docID"`
			}
			if err := json.Unmarshal(raw, &m); err != nil {
				t.Fatalf("client %s got unreadable payload: %v", c.id, err)
			}
			out = append(out, m.DocID)
		case <-time.After(50 * time.Millisecond):
			return out
		}
	}
}

// A document reaches every connection of the account that owns it, and no
// connection of any other account.
//
// This is the property the owner exists for. The routing key travels a long way
// — a document's `_meta.owner`, a NATS subject, a message field, a decoded owner
// — and every step of that is checked in isolation elsewhere. What decides who
// actually receives the bytes is this fan-out, and a mistake here delivers one
// account's jobs to another's browser.
func TestAccountBroadcastReachesOnlyTheOwningAccount(t *testing.T) {
	f := newIntegFixture(t)

	ownerAcct := "acct-owner"
	otherAcct := "acct-other"

	tabA := f.newClient("owner-tab-a", ownerAcct, nil, nil)
	tabB := f.newClient("owner-tab-b", ownerAcct, nil, nil)
	stranger := f.newClient("other-tab", otherAcct, nil, nil)
	for _, c := range []*Client{tabA, tabB, stranger} {
		f.register(c)
	}

	payload := docUpdateFor(t, models.AccountOwner(ownerAcct), "job-1")
	out := f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.job-1", payload)

	if out.RouteKind != "account" {
		t.Fatalf("route kind = %q, want account", out.RouteKind)
	}

	// Both of the owner's tabs, because a change is for the account rather than
	// the connection that happens to be looking at it.
	for _, c := range []*Client{tabA, tabB} {
		if got := received(t, c); len(got) != 1 || got[0] != "job-1" {
			t.Fatalf("owner tab %s received %v, want [job-1]", c.id, got)
		}
	}
	if got := received(t, stranger); len(got) != 0 {
		t.Fatalf("a client of %s received %v — another account's document reached it", otherAcct, got)
	}
}

// The owner on the message decides delivery, not the collection or the document
// id: two accounts editing documents with the same id stay apart.
func TestAccountBroadcastKeysOnTheOwnerNotTheDocument(t *testing.T) {
	f := newIntegFixture(t)

	first := f.newClient("first-tab", "acct-first", nil, nil)
	second := f.newClient("second-tab", "acct-second", nil, nil)
	f.register(first)
	f.register(second)

	// The same document id under two owners, as two accounts holding a job with
	// the same generated id would produce.
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.shared-id",
		docUpdateFor(t, models.AccountOwner("acct-first"), "shared-id"))

	if got := received(t, first); len(got) != 1 {
		t.Fatalf("the owning account received %v, want one message", got)
	}
	if got := received(t, second); len(got) != 0 {
		t.Fatalf("the other account received %v for a document id it shares", got)
	}
}

// An owner key the decoder cannot read must not fall back to a broadcast. It
// delivers to explicit subscribers only, so an unroutable message reaches too
// few clients rather than the wrong ones.
func TestUnreadableOwnerDoesNotBroadcast(t *testing.T) {
	f := newIntegFixture(t)

	client := f.newClient("some-tab", "acct-a", nil, nil)
	f.register(client)

	for name, raw := range map[string][]byte{
		"no owner":       docUpdateFor(t, models.Owner{}, "job-2"),
		"raw eve id":     []byte(`{"collection":"job_documents","docID":"job-2","ownerKey":"corporation:98000001"}`),
		"unknown kind":   []byte(`{"collection":"job_documents","docID":"job-2","ownerKey":"wardec:x"}`),
		"key with no id": []byte(`{"collection":"job_documents","docID":"job-2","ownerKey":"account:"}`),
		"no separator":   []byte(`{"collection":"job_documents","docID":"job-2","ownerKey":"account"}`),
	} {
		t.Run(name, func(t *testing.T) {
			out := f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.job-2", raw)
			if out.RouteKind == "account" {
				t.Fatalf("an unreadable owner routed as an account broadcast")
			}
			if got := received(t, client); len(got) != 0 {
				t.Fatalf("client received %v from an unroutable message", got)
			}
		})
	}
}

// A connection listed under an account it does not hold is refused delivery.
//
// The index and the client both name an account, and they are written at
// different times. When they disagree the index is not trusted: a stale entry
// would otherwise hand one account's documents to another's socket.
func TestAccountBroadcastRefusesAClientIndexedUnderAnotherAccount(t *testing.T) {
	f := newIntegFixture(t)

	// Registered normally, then the client's own account is changed underneath the
	// index — the shape a stale index entry has.
	c := f.newClient("drifted-tab", "acct-owner", nil, nil)
	f.register(c)
	c.AccountID = "acct-somebody-else"

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.job-3",
		docUpdateFor(t, models.AccountOwner("acct-owner"), "job-3"))

	if got := received(t, c); len(got) != 0 {
		t.Fatalf("a client holding %q received %v addressed to acct-owner", c.AccountID, got)
	}
}

// orgClient registers a client holding granted org scopes, as a session upgrade
// would leave it: the scopes drive the corp and alliance pools it lands in.
func (f *integFixture) orgClient(id, accountID string, corps, alliances []string) *Client {
	f.t.Helper()
	c := f.newClient(id, accountID, corps, alliances)
	f.register(c)
	f.Server.swapClientOrgScopesAndIndexes(c, model.RealtimeScopes{
		CorporationRefs: corps,
		AllianceRefs:    alliances,
	})
	return c
}

// One server, one message per kind, clients holding different mixtures of them.
//
// Each kind is delivered by its own index and its own second gate — accounts by
// userConnections and an account match, corporations and alliances by their ref
// pools and the granted scope ceiling. Testing a kind on its own leaves the
// question this answers: whether a client holding one kind can be reached by a
// message addressed to another.
func TestMixedOwnerKindsEachReachOnlyTheirOwn(t *testing.T) {
	f := newIntegFixture(t)

	const (
		corpRef  = "corp_56_JxK"
		otherRef = "corp_77_LmN"
		allyRef  = "alliance_9_Qm"
	)

	// A plain account holder, a member of the corporation, and a member of the
	// alliance who is not in that corporation.
	plain := f.orgClient("plain-tab", "acct-plain", nil, nil)
	corpMember := f.orgClient("corp-tab", "acct-corp", []string{corpRef}, nil)
	allyMember := f.orgClient("ally-tab", "acct-ally", nil, []string{allyRef})

	deliver := func(owner models.Owner, docID string) {
		t.Helper()
		f.Server.deliverOutboundDocUpdate(context.Background(),
			"job_documents."+docID, docUpdateFor(t, owner, docID))
	}

	// An account document reaches its account and neither org member.
	deliver(models.AccountOwner("acct-plain"), "acct-doc")
	if got := received(t, plain); len(got) != 1 || got[0] != "acct-doc" {
		t.Fatalf("account owner received %v, want [acct-doc]", got)
	}
	for _, c := range []*Client{corpMember, allyMember} {
		if got := received(t, c); len(got) != 0 {
			t.Fatalf("%s received %v from an account-owned document", c.id, got)
		}
	}

	// A corporation document reaches the member holding that ref and nobody else.
	deliver(models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "corp-doc")
	if got := received(t, corpMember); len(got) != 1 || got[0] != "corp-doc" {
		t.Fatalf("corp member received %v, want [corp-doc]", got)
	}
	for _, c := range []*Client{plain, allyMember} {
		if got := received(t, c); len(got) != 0 {
			t.Fatalf("%s received %v from a corporation-owned document", c.id, got)
		}
	}

	// An alliance document reaches the alliance member, not the corporation member.
	deliver(models.Owner{Kind: models.OwnerAlliance, ID: allyRef}, "ally-doc")
	if got := received(t, allyMember); len(got) != 1 || got[0] != "ally-doc" {
		t.Fatalf("alliance member received %v, want [ally-doc]", got)
	}
	for _, c := range []*Client{plain, corpMember} {
		if got := received(t, c); len(got) != 0 {
			t.Fatalf("%s received %v from an alliance-owned document", c.id, got)
		}
	}

	// A corporation nobody holds reaches nobody, rather than falling back.
	deliver(models.Owner{Kind: models.OwnerCorporation, ID: otherRef}, "stranger-doc")
	for _, c := range []*Client{plain, corpMember, allyMember} {
		if got := received(t, c); len(got) != 0 {
			t.Fatalf("%s received %v addressed to a corporation it does not hold", c.id, got)
		}
	}
}

// One connection holding several kinds receives each of its own and none of the
// kinds it does not hold. The kinds compose on one client rather than being
// alternatives.
func TestOneClientHoldingSeveralKindsReceivesEach(t *testing.T) {
	f := newIntegFixture(t)

	const (
		corpRef    = "corp_56_JxK"
		allyRef    = "alliance_9_Qm"
		unheldCorp = "corp_77_LmN"
		unheldAlly = "alliance_8_Zz"
	)

	c := f.orgClient("multi-tab", "acct-multi", []string{corpRef}, []string{allyRef})

	for _, tc := range []struct {
		owner models.Owner
		docID string
		want  bool
	}{
		{models.AccountOwner("acct-multi"), "own-account", true},
		{models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "own-corp", true},
		{models.Owner{Kind: models.OwnerAlliance, ID: allyRef}, "own-alliance", true},
		{models.AccountOwner("acct-somebody"), "other-account", false},
		{models.Owner{Kind: models.OwnerCorporation, ID: unheldCorp}, "other-corp", false},
		{models.Owner{Kind: models.OwnerAlliance, ID: unheldAlly}, "other-alliance", false},
	} {
		f.Server.deliverOutboundDocUpdate(context.Background(),
			"job_documents."+tc.docID, docUpdateFor(t, tc.owner, tc.docID))

		got := received(t, c)
		if tc.want && (len(got) != 1 || got[0] != tc.docID) {
			t.Fatalf("%s: received %v, want [%s]", tc.owner.Key(), got, tc.docID)
		}
		if !tc.want && len(got) != 0 {
			t.Fatalf("%s: received %v, want nothing", tc.owner.Key(), got)
		}
	}
}

// A corporation message narrowed to named accounts reaches only those accounts,
// even though every recipient holds the corporation ref.
func TestCorporationScopeNarrowedToAccounts(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	inScope := f.orgClient("in-scope", "acct-in", []string{corpRef}, nil)
	outOfScope := f.orgClient("out-of-scope", "acct-out", []string{corpRef}, nil)

	raw, err := json.Marshal(map[string]any{
		"collection":    eipmongo.CollectionJobDocuments,
		"docID":         "narrowed",
		"operationType": "update",
		"ownerKey":      models.Owner{Kind: models.OwnerCorporation, ID: corpRef}.Key(),
		"scopes":        map[string]any{"accountIDs": []string{"acct-in"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.narrowed", raw)

	if got := received(t, inScope); len(got) != 1 || got[0] != "narrowed" {
		t.Fatalf("the named account received %v, want [narrowed]", got)
	}
	if got := received(t, outOfScope); len(got) != 0 {
		t.Fatalf("an account outside the downward scope received %v", got)
	}
}

// A client left in a corporation's pool after losing the grant is refused.
//
// The pool and the client's granted scopes are written at different moments —
// a revoked grant, a reconnect, a scope swap racing a delivery — so the pool
// alone is not authority. This is the org-kind counterpart of the account
// mismatch check, and the case that separates the two gates: the pool says
// deliver, the ceiling says no.
func TestCorporationScopeRefusesAClientLeftInThePool(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	c := f.orgClient("stale-tab", "acct-stale", []string{corpRef}, nil)

	// The grant goes away while the pool entry stays, which is the drift the
	// ceiling exists for.
	c.Scopes = model.RealtimeScopes{}

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.stale",
		docUpdateFor(t, models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "stale"))

	if got := received(t, c); len(got) != 0 {
		t.Fatalf("a client that no longer holds %s received %v", corpRef, got)
	}
}
