package server

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	eipmongo "eve-industry-planner/shared/mongo"
	eipnats "eve-industry-planner/shared/nats"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

// docUpdateFrom builds the payload the watcher publishes for an owner, naming the
// connection that made the change as it does when a browser write caused it. An
// empty id is simply absent, which is how a change no connection claims arrives.
//
// This is the one place the tests state the message shape; vary it here.
func docUpdateFrom(t *testing.T, owner models.Owner, docID, sourceClientID, sourceSessionID string) []byte {
	t.Helper()
	body := map[string]any{
		"collection":    eipmongo.CollectionJobDocuments,
		"docID":         docID,
		"operationType": "update",
	}
	if !owner.IsZero() {
		body["ownerKey"] = owner.Key()
	}
	if sourceClientID != "" {
		body["sourceClientID"] = sourceClientID
	}
	if sourceSessionID != "" {
		body["sourceSessionID"] = sourceSessionID
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// docUpdateFor builds the payload the watcher publishes for an owner, as a change
// no connection claims: nothing is suppressed on delivery.
func docUpdateFor(t *testing.T, owner models.Owner, docID string) []byte {
	t.Helper()
	return docUpdateFrom(t, owner, docID, "", "")
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

	// The route kind names the audience that carried it and the owner kind the
	// owner it addressed, which together say what one field used to.
	if out.RouteKind != string(eipnats.AudienceSubscribers) || out.OwnerKind != string(models.OwnerAccount) {
		t.Fatalf("routed as %q/%q, want subscribers of an account", out.RouteKind, out.OwnerKind)
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
			if out.OwnerKind != "" {
				t.Fatalf("an unreadable owner routed to owner kind %q", out.OwnerKind)
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
	f.Server.setClientScopes(c, orgOwnerKeys(corps, alliances))
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

// Every member of a corporation planner receives its changes. Holding the owner's
// key is the whole entitlement; which account a member signs in as decides
// nothing.
func TestCorporationScopeReachesEveryMember(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	one := f.orgClient("member-one", "acct-one", []string{corpRef}, nil)
	two := f.orgClient("member-two", "acct-two", []string{corpRef}, nil)

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.shared",
		docUpdateFor(t, models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "shared"))

	for _, c := range []*Client{one, two} {
		if got := received(t, c); len(got) != 1 || got[0] != "shared" {
			t.Fatalf("%s received %v, want [shared]", c.id, got)
		}
	}
}

// A client working in an alliance planner holds the alliance key and nothing
// else: scopes are the account key plus the active planner, so there is no
// corporation key to sit under. Delivery must not ask for one.
func TestAllianceScopeReachesAClientHoldingNoCorporationKey(t *testing.T) {
	f := newIntegFixture(t)

	const allyRef = "alliance_9_Qm"
	c := f.orgClient("ally-tab", "acct-ally", nil, []string{allyRef})

	if ids := c.Scopes.IDsForKind(models.OwnerCorporation); len(ids) != 0 {
		t.Fatalf("the client holds corporation keys %v, which this case is about not having", ids)
	}

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.ally-doc",
		docUpdateFor(t, models.Owner{Kind: models.OwnerAlliance, ID: allyRef}, "ally-doc"))

	if got := received(t, c); len(got) != 1 || got[0] != "ally-doc" {
		t.Fatalf("an alliance-planner client received %v, want [ally-doc]", got)
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
	c.Scopes = nil

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.stale",
		docUpdateFor(t, models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "stale"))

	if got := received(t, c); len(got) != 0 {
		t.Fatalf("a client that no longer holds %s received %v", corpRef, got)
	}
}

// The tab that made the change has already applied it and would be told to apply
// it again; its siblings have not. Suppression is per tab rather than per session
// for that reason, so a second tab of the same login is a recipient.
//
// Each delivery path checks this for itself, so each is exercised: a shared owner
// by the owner walk, an account by the user-connection index, and a doc someone
// subscribed to by name.
func TestDeliveryPathsSuppressTheTabThatMadeTheChange(t *testing.T) {
	const (
		corpRef = "corp_56_JxK"
		session = "sess-shared"
	)

	for _, tc := range []struct {
		name  string
		owner models.Owner
		docID string
		// deliver runs the path under test after both tabs are registered.
		setUp func(f *integFixture, writer, sibling *Client)
	}{
		{
			name:  "owner walk",
			owner: models.Owner{Kind: models.OwnerCorporation, ID: corpRef},
			docID: "corp-doc",
		},
		{
			name:  "account",
			owner: models.AccountOwner("acct-writer"),
			docID: "account-doc",
		},
		{
			name:  "explicit doc subscribers",
			owner: models.Owner{},
			docID: "watched-doc",
			setUp: func(f *integFixture, writer, sibling *Client) {
				const scoped = "job_documents.watched-doc"
				for _, c := range []*Client{writer, sibling} {
					c.explicitDocIDs = map[string]bool{scoped: true}
					f.Server.addExplicitSubscriber(c.id, scoped)
				}
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newIntegFixture(t)

			corps := []string{corpRef}
			if tc.owner.Kind != models.OwnerCorporation {
				corps = nil
			}
			writer := f.orgClient("writer-tab", "acct-writer", corps, nil)
			sibling := f.orgClient("sibling-tab", "acct-writer", corps, nil)
			writer.SessionID = session
			sibling.SessionID = session
			if tc.setUp != nil {
				tc.setUp(f, writer, sibling)
			}

			f.Server.deliverOutboundDocUpdate(context.Background(),
				"job_documents."+tc.docID,
				docUpdateFrom(t, tc.owner, tc.docID, writer.id, session))

			if got := received(t, writer); len(got) != 0 {
				t.Fatalf("the tab that made the change received %v back", got)
			}
			if got := received(t, sibling); len(got) != 1 || got[0] != tc.docID {
				t.Fatalf("the sibling tab received %v, want [%s]", got, tc.docID)
			}
		})
	}
}

// A write that names no tab — a server-side job, a task, anything not made in a
// browser — suppresses the whole session instead, which is the only identifier
// it has. Nothing outside that session is affected.
func TestOwnerWalkFallsBackToSuppressingTheWholeSession(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	writerSession := f.orgClient("writer-tab", "acct-writer", []string{corpRef}, nil)
	writerSession.SessionID = "sess-writer"
	otherMember := f.orgClient("other-tab", "acct-other", []string{corpRef}, nil)
	otherMember.SessionID = "sess-other"

	f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.corp-doc",
		docUpdateFrom(t, models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, "corp-doc", "", "sess-writer"))

	if got := received(t, writerSession); len(got) != 0 {
		t.Fatalf("a tab of the originating session received %v back", got)
	}
	if got := received(t, otherMember); len(got) != 1 || got[0] != "corp-doc" {
		t.Fatalf("another member received %v, want [corp-doc]", got)
	}
}

// A client rebuilding its state is held back from a document change.
//
// The baseline it is writing is half there, so a change applied on top of one
// lands in a document about to be replaced. It refetches what it missed when the
// rebuild finishes, which is why skipping costs nothing.
func TestADocumentIsHeldBackFromAClientMidSync(t *testing.T) {
	f := newIntegFixture(t)

	syncing := f.orgClient("syncing-tab", "acct-owner", nil, nil)
	settled := f.orgClient("settled-tab", "acct-owner", nil, nil)
	syncing.SyncMu.Lock()
	syncing.SyncInProgress = true
	syncing.SyncMu.Unlock()

	out := f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.job-1",
		docUpdateFor(t, models.AccountOwner("acct-owner"), "job-1"))

	if len(out.SkippedSyncClientIDs) != 1 || out.SkippedSyncClientIDs[0] != syncing.id {
		t.Fatalf("sync skips = %v, want [%s]", out.SkippedSyncClientIDs, syncing.id)
	}
	if got := received(t, syncing); len(got) != 0 {
		t.Fatalf("a client mid-sync received %v", got)
	}
	if got := received(t, settled); len(got) != 1 || got[0] != "job-1" {
		t.Fatalf("the settled tab received %v, want [job-1]", got)
	}
}

// The sync gate belongs to the document family rather than to delivery. An
// announcement is one fact with nothing to apply it on top of, so a client
// rebuilding still gets it — which is what makes the policy table worth having
// rather than a check every message runs.
func TestAnAnnouncementStillReachesAClientMidSync(t *testing.T) {
	f := newIntegFixture(t)

	syncing := f.orgClient("syncing-tab", "acct-owner", nil, nil)
	syncing.SyncMu.Lock()
	syncing.SyncInProgress = true
	syncing.SyncMu.Unlock()

	if sent, routed := f.delivered(everyoneMessage(staticDataFrame(t, 42, "2026-09-13"))); !routed || sent != 1 {
		t.Fatalf("routed=%v sent=%d, want the announcement delivered", routed, sent)
	}
	if got := receivedFrames(t, syncing); len(got) != 1 {
		t.Fatalf("a client mid-sync received %d announcements, want 1", len(got))
	}
}

// A client left in a document's subscriber index after dropping the document is
// refused.
//
// The index and the client's own set are written at different moments — an
// unsubscribe racing a delivery, a reconnect — so the index alone is not
// authority, exactly as the owner pool is not for a scoped change.
func TestByNameDeliveryRefusesAClientLeftInTheIndex(t *testing.T) {
	f := newIntegFixture(t)

	const scoped = "job_documents.watched-doc"
	stale := f.orgClient("stale-tab", "acct-any", nil, nil)
	f.Server.addExplicitSubscriber(stale.id, scoped)
	// The client's own set no longer holds it while the index entry stays.
	stale.explicitDocIDs = map[string]bool{}

	// A message stating no owner is the one that addresses by-name subscribers.
	out := f.Server.deliverOutboundDocUpdate(context.Background(), scoped,
		docUpdateFor(t, models.Owner{}, "watched-doc"))

	if out.RecipientCount != 0 {
		t.Fatalf("recipients = %d, want nothing delivered", out.RecipientCount)
	}
	if len(out.SkippedScopeClientIDs) != 1 || out.SkippedScopeClientIDs[0] != stale.id {
		t.Fatalf("scope skips = %v, want [%s]", out.SkippedScopeClientIDs, stale.id)
	}
	if got := received(t, stale); len(got) != 0 {
		t.Fatalf("a client that dropped the document received %v", got)
	}
}

// An owner kind with no id addresses no pool, so it is reported as a defect
// rather than as an audience nobody happened to be connected for. The two read
// identically otherwise and only one of them wants looking at.
func TestAnOwnerWithNoIDIsReportedRatherThanEmpty(t *testing.T) {
	f := newIntegFixture(t)
	c := f.orgClient("a-tab", "acct-any", nil, nil)

	out := f.Server.deliverOutbound(Outbound{
		Family:   eipnats.ClientMessageDocument,
		Audience: eipnats.AudienceSubscribers,
		Target:   models.Owner{Kind: models.OwnerAccount},
		Frame:    []byte(`{"docID":"job-1"}`),
	})
	if out.Undeliverable != "unaddressable_target" {
		t.Fatalf("undeliverable = %q, want unaddressable_target", out.Undeliverable)
	}
	if got := received(t, c); len(got) != 0 {
		t.Fatalf("a client received %v addressed to an owner with no id", got)
	}
}

// A document that cannot be delivered says so on the outcome, which is what
// separates a defect from an idle replica in the delivery log. Both reach
// nobody, and only one wants an operator's attention.
//
// Unreadable JSON is the only way a document gets here: an owner key the model
// refuses is normalised to no owner by the decoder, which addresses by-name
// subscribers rather than failing.
func TestAnUndeliverableDocumentIsReportedOnTheOutcome(t *testing.T) {
	f := newIntegFixture(t)

	out := f.Server.deliverOutboundDocUpdate(context.Background(), "job_documents.job-1", []byte(`{not json`))
	if out.Undeliverable != "unreadable_message" {
		t.Fatalf("undeliverable = %q, want unreadable_message", out.Undeliverable)
	}
	if out.RecipientCount != 0 {
		t.Fatalf("recipients = %d, want nothing delivered", out.RecipientCount)
	}
}

// An undeliverable message is logged as a rejection rather than as a replica
// with nobody connected, whichever family it belongs to.
//
// Both deliver to nobody, so the outcome alone cannot tell them apart; only the
// severity and the message do, and an operator alerts on one of them.
func TestAnUndeliverableMessageIsLoggedAsARejection(t *testing.T) {
	for name, tc := range map[string]struct {
		what      string
		outcome   outboundDeliveryOutcome
		wantLevel zapcore.Level
		wantMsg   string
	}{
		"undeliverable document": {
			what:      "doc update",
			outcome:   outboundDeliveryOutcome{Undeliverable: "unreadable_message"},
			wantLevel: zapcore.WarnLevel,
			wantMsg:   "doc update rejected",
		},
		"nobody connected": {
			what:      "doc update",
			outcome:   outboundDeliveryOutcome{RouteKind: "subscribers"},
			wantLevel: zapcore.DebugLevel,
			wantMsg:   "doc update delivered (idle replica)",
		},
		"held back on purpose": {
			what:      "doc update",
			outcome:   outboundDeliveryOutcome{RouteKind: "subscribers", CandidateCount: 1, SkippedEchoClientIDs: []string{"c1"}},
			wantLevel: zapcore.DebugLevel,
			wantMsg:   "doc update delivered (suppressed on replica)",
		},
		"lost rather than held back": {
			what:      "doc update",
			outcome:   outboundDeliveryOutcome{RouteKind: "subscribers", CandidateCount: 1, SkippedSendBufferFullClientIDs: []string{"c1"}},
			wantLevel: zapcore.DebugLevel,
			wantMsg:   "doc update delivered (no recipients on replica)",
		},
		"undeliverable lock": {
			what:      "doc lock notification",
			outcome:   outboundDeliveryOutcome{Undeliverable: "unaddressable_target"},
			wantLevel: zapcore.WarnLevel,
			wantMsg:   "doc lock notification rejected",
		},
	} {
		t.Run(name, func(t *testing.T) {
			core, recorded := observer.New(zapcore.DebugLevel)
			ctx := logs.ContextWithLogger(context.Background(), zap.New(core))

			finishReplicaFanoutOperation(ctx, tc.what, "job_documents.job-1", "doc.update.x", tc.outcome, nil)

			entries := recorded.FilterMessage(tc.wantMsg).All()
			if len(entries) != 1 {
				t.Fatalf("logged %v, want one %q", recorded.All(), tc.wantMsg)
			}
			if entries[0].Level != tc.wantLevel {
				t.Fatalf("level = %v, want %v", entries[0].Level, tc.wantLevel)
			}
		})
	}
}
