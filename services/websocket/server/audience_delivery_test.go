package server

import (
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// everyoneMessage addresses a frame to every socket, as it arrives on the wire.
func everyoneMessage(frame []byte) eipnats.AudienceMessage {
	return eipnats.AudienceMessage{
		Audience: eipnats.AudienceEveryone,
		Target:   eipnats.TargetEveryone,
		Family:   eipnats.ClientMessageStaticData,
		Subtype:  eipnats.SubtypeStaticDataBuildUpdated,
		Payload:  frame,
	}
}

// subscribersMessage addresses a frame to the people working in an owner.
func subscribersMessage(owner models.Owner, frame []byte) eipnats.AudienceMessage {
	return eipnats.AudienceMessage{
		Audience: eipnats.AudienceSubscribers,
		Target:   owner.Key(),
		Family:   eipnats.ClientMessageNotification,
		Subtype:  eipnats.NotificationArchiveStatsProcessed,
		Payload:  frame,
	}
}

// delivered runs a message through the adapter and the walk, as the subscription
// does, reporting recipients and whether anything could deliver it.
func (f *integFixture) delivered(msg eipnats.AudienceMessage) (int, bool) {
	f.t.Helper()
	outcome := f.Server.deliverOutbound(audienceOutbound(msg))
	return outcome.RecipientCount, outcome.Undeliverable == ""
}

// staticDataFrame is the frame a producer publishes for a new build.
func staticDataFrame(t *testing.T, buildNumber int, version string) []byte {
	t.Helper()
	payload, err := json.Marshal(eipnats.StaticDataMessage{
		Type:        eipnats.ClientMessageStaticData,
		BuildNumber: buildNumber,
		Version:     version,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return payload
}

// audienceFrame is a frame the delivery side forwards without reading, so its
// content only has to be distinguishable.
func audienceFrame(subtype string) []byte {
	return []byte(`{"type":"notification","subtype":"` + subtype + `"}`)
}

// receivedFrames drains a client's send channel, returning what it was given.
func receivedFrames(t *testing.T, c *Client) [][]byte {
	t.Helper()
	var out [][]byte
	for {
		select {
		case raw := <-c.Send:
			out = append(out, raw)
		default:
			return out
		}
	}
}

// The everyone audience reaches every socket, whoever is behind it — including a
// connection holding no owner beyond its own account.
func TestEveryoneAudienceReachesEverySocket(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	member := f.orgClient("member-tab", "acct-member", []string{corpRef}, nil)
	stranger := f.orgClient("stranger-tab", "acct-stranger", nil, nil)

	recipients, routed := f.delivered(everyoneMessage(staticDataFrame(t, 42, "2026-09-13")))
	if !routed || recipients != 2 {
		t.Fatalf("routed=%v recipients=%d, want both sockets", routed, recipients)
	}
	for _, c := range []*Client{member, stranger} {
		if got := receivedFrames(t, c); len(got) != 1 {
			t.Fatalf("%s received %d frames, want 1", c.id, len(got))
		}
	}
}

// The subscribers audience reaches the connections working in the owner and
// nobody else, which is the same entitlement that owner's documents carry.
func TestSubscribersAudienceReachesOnlyThatOwnersConnections(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	member := f.orgClient("member-tab", "acct-member", []string{corpRef}, nil)
	outsider := f.orgClient("outsider-tab", "acct-outsider", nil, nil)

	recipients, routed := f.delivered(subscribersMessage(
		models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, audienceFrame("archiveStatsProcessed")))
	if !routed || recipients != 1 {
		t.Fatalf("routed=%v recipients=%d, want the one member", routed, recipients)
	}
	if got := receivedFrames(t, member); len(got) != 1 {
		t.Fatalf("the member received %d frames, want 1", len(got))
	}
	if got := receivedFrames(t, outsider); len(got) != 0 {
		t.Fatalf("a connection outside the owner received %d frames", len(got))
	}
}

// An account is reached through its own connection index rather than the owner
// pools, which never carry an account's own key. Addressing one by owner key has
// to find its tabs anyway, or every account-addressed message would reach
// nothing.
func TestSubscribersAudienceReachesAnAccountsOwnTabs(t *testing.T) {
	f := newIntegFixture(t)

	one := f.orgClient("tab-one", "acct-owner", nil, nil)
	two := f.orgClient("tab-two", "acct-owner", nil, nil)
	other := f.orgClient("other-tab", "acct-other", nil, nil)

	recipients, routed := f.delivered(subscribersMessage(
		models.AccountOwner("acct-owner"), audienceFrame("archiveStatsProcessed")))
	if !routed || recipients != 2 {
		t.Fatalf("routed=%v recipients=%d, want both of the account's tabs", routed, recipients)
	}
	for _, c := range []*Client{one, two} {
		if got := receivedFrames(t, c); len(got) != 1 {
			t.Fatalf("%s received %d frames, want 1", c.id, len(got))
		}
	}
	if got := receivedFrames(t, other); len(got) != 0 {
		t.Fatalf("another account received %d frames", len(got))
	}
}

// An audience this build has no fan-out for is reported as unrouted rather than
// counted as a delivery nobody was connected for — the two read identically in
// the logs otherwise, and only one of them is a defect.
func TestAnUnknownAudienceIsReportedRatherThanDroppedQuietly(t *testing.T) {
	f := newIntegFixture(t)
	f.orgClient("a-tab", "acct-any", nil, nil)

	if recipients, routed := f.delivered(eipnats.AudienceMessage{
		Audience: eipnats.Audience("members"),
		Target:   models.AccountOwner("acct-any").Key(),
		Family:   eipnats.ClientMessageNotification,
		Subtype:  "somethingHappened",
		Payload:  audienceFrame("somethingHappened"),
	}); routed || recipients != 0 {
		t.Fatalf("routed=%v recipients=%d, want an unrouted report", routed, recipients)
	}
}

// A target that names no owner reaches nothing rather than falling through to a
// shared bucket, which is what an unparsed key would address. It is reported as
// a defect too: a key the owner model cannot read is a producer problem, not an
// audience that happened to be empty.
func TestSubscribersAudienceWithAnUnreadableTargetIsReported(t *testing.T) {
	f := newIntegFixture(t)
	c := f.orgClient("a-tab", "acct-any", nil, nil)

	outcome := f.Server.deliverOutbound(audienceOutbound(eipnats.AudienceMessage{
		Audience: eipnats.AudienceSubscribers,
		Target:   "not-an-owner-key",
		Family:   eipnats.ClientMessageNotification,
		Subtype:  "archiveStatsProcessed",
		Payload:  audienceFrame("archiveStatsProcessed"),
	}))
	if outcome.Undeliverable != "unaddressable_target" || outcome.RecipientCount != 0 {
		t.Fatalf("undeliverable=%q recipients=%d, want an unaddressable report",
			outcome.Undeliverable, outcome.RecipientCount)
	}
	if got := receivedFrames(t, c); len(got) != 0 {
		t.Fatalf("a client received %d frames addressed to an unreadable owner", len(got))
	}
}

// The socket has to stay up: a client told something on this audience carries on
// with the session it was in, unlike a maintenance window where the close is the
// point.
func TestAnEveryoneAnnouncementLeavesTheSocketOpen(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-sde", "sess-sde-1")
	conn := f.dial("sess-sde-1")
	defer func() { _ = conn.Close() }()
	_ = f.readJSONMessage(conn, 2*time.Second) // connected
	f.waitClients(1, 2*time.Second)

	if sent, routed := f.delivered(everyoneMessage(staticDataFrame(t, 42, "2026-09-13"))); !routed || sent != 1 {
		t.Fatalf("routed=%v sent=%d, want the one socket", routed, sent)
	}

	msg := f.readJSONOfType(conn, eipnats.ClientMessageStaticData, 3*time.Second)
	if got, _ := msg["version"].(string); got != "2026-09-13" {
		t.Errorf("version = %v, want 2026-09-13: %v", msg["version"], msg)
	}
	if got, _ := msg["buildNumber"].(float64); int(got) != 42 {
		t.Errorf("buildNumber = %v, want 42: %v", msg["buildNumber"], msg)
	}

	f.waitClients(1, 2*time.Second)
	if f.Server.ConnectedCount() != 1 {
		t.Fatal("the client was dropped by an announcement that only had news to deliver")
	}
}

// A client that cannot take the message is skipped rather than waited for: the
// announcement is a shortcut, and blocking the fan-out on one stalled socket
// would cost every other client its news.
func TestAnEveryoneAnnouncementSkipsAFullBuffer(t *testing.T) {
	f := newIntegFixture(t)

	stalled := f.newClient("sde-stalled", "acct-stalled", nil, nil)
	healthy := f.newClient("sde-healthy", "acct-healthy", nil, nil)
	f.register(stalled)
	f.register(healthy)
	defer f.unregister(stalled)
	defer f.unregister(healthy)

	for len(stalled.Send) < cap(stalled.Send) {
		stalled.Send <- []byte(`{"type":"filler"}`)
	}

	done := make(chan int, 1)
	go func() {
		sent, _ := f.delivered(everyoneMessage(staticDataFrame(t, 9, "2026-09-13")))
		done <- sent
	}()

	select {
	case sent := <-done:
		if sent != 1 {
			t.Fatalf("sent = %d, want 1: only the client with room should have taken it", sent)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the fan-out blocked on a client that could not take the message")
	}
}

// Audience delivery reports what every other path already reports.
//
// It returned a bare recipient count when it was written, which reads in the
// logs as a delivery with nothing to say about who was skipped and why. An
// operator asking "who missed this?" needs the same answer here as for a
// document.
func TestAudienceDeliveryReportsTheSameOutcomeAsEveryOtherPath(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	member := f.orgClient("member-tab", "acct-member", []string{corpRef}, nil)
	gone := f.orgClient("departed-tab", "acct-gone", []string{corpRef}, nil)
	full := f.orgClient("stalled-tab", "acct-stalled", []string{corpRef}, nil)

	// One candidate the index still names but the client map does not, and one
	// that cannot take the message.
	f.Server.ClientsMu.Lock()
	delete(f.Server.Clients, gone.id)
	f.Server.ClientsMu.Unlock()
	for len(full.Send) < cap(full.Send) {
		full.Send <- []byte(`{"type":"filler"}`)
	}

	owner := models.Owner{Kind: models.OwnerCorporation, ID: corpRef}
	outcome := f.Server.deliverOutbound(audienceOutbound(
		subscribersMessage(owner, audienceFrame("archiveStatsProcessed"))))

	if outcome.RouteKind != string(eipnats.AudienceSubscribers) {
		t.Fatalf("route kind = %q, want the audience that routed it", outcome.RouteKind)
	}
	if outcome.OwnerRef != corpRef {
		t.Fatalf("owner ref = %q, want %q", outcome.OwnerRef, corpRef)
	}
	if outcome.CandidateCount != 3 {
		t.Fatalf("candidates = %d, want the three in the pool", outcome.CandidateCount)
	}
	if outcome.RecipientCount != 1 {
		t.Fatalf("recipients = %d, want the one that could take it", outcome.RecipientCount)
	}
	if len(outcome.SkippedNotConnectedClientIDs) != 1 || outcome.SkippedNotConnectedClientIDs[0] != gone.id {
		t.Fatalf("not-connected skips = %v, want [%s]", outcome.SkippedNotConnectedClientIDs, gone.id)
	}
	if len(outcome.SkippedSendBufferFullClientIDs) != 1 || outcome.SkippedSendBufferFullClientIDs[0] != full.id {
		t.Fatalf("buffer-full skips = %v, want [%s]", outcome.SkippedSendBufferFullClientIDs, full.id)
	}
	if len(outcome.RecipientClientIDs) != 1 || outcome.RecipientClientIDs[0] != member.id {
		t.Fatalf("recipients = %v, want [%s]", outcome.RecipientClientIDs, member.id)
	}
}

// A client left in an owner's pool after losing the grant is refused.
//
// The pool and a client's scopes are written at different moments — a revoked
// grant, a reconnect, a planner switch racing a delivery — so the pool alone is
// not authority for this path any more than it is for that owner's documents.
func TestSubscribersAudienceRefusesAClientLeftInThePool(t *testing.T) {
	f := newIntegFixture(t)

	const corpRef = "corp_56_JxK"
	stale := f.orgClient("stale-tab", "acct-stale", []string{corpRef}, nil)

	// The grant goes away while the pool entry stays.
	stale.Scopes = nil

	owner := models.Owner{Kind: models.OwnerCorporation, ID: corpRef}
	recipients, routed := f.delivered(subscribersMessage(owner, audienceFrame("archiveStatsProcessed")))
	if !routed || recipients != 0 {
		t.Fatalf("routed=%v recipients=%d, want nothing delivered", routed, recipients)
	}
	if got := receivedFrames(t, stale); len(got) != 0 {
		t.Fatalf("a client outside the grant received %d frames", len(got))
	}
}

// An account's tab that no longer belongs to the account is refused for the same
// reason, through the other index.
func TestSubscribersAudienceRefusesATabThatChangedAccount(t *testing.T) {
	f := newIntegFixture(t)

	drifted := f.orgClient("drifted-tab", "acct-owner", nil, nil)
	drifted.AccountID = "acct-somebody-else"

	recipients, _ := f.delivered(subscribersMessage(
		models.AccountOwner("acct-owner"), audienceFrame("archiveStatsProcessed")))
	if recipients != 0 {
		t.Fatalf("recipients = %d, want nothing delivered", recipients)
	}
	if got := receivedFrames(t, drifted); len(got) != 0 {
		t.Fatalf("a client holding %q received %d frames addressed to acct-owner", drifted.AccountID, len(got))
	}
}

// The walk skips the connection a message came from, and its siblings still get
// it. No adapter names a source yet — the audience families carry none — so this
// holds the gate for the paths that will.
func TestTheWalkSkipsTheConnectionAMessageCameFrom(t *testing.T) {
	f := newIntegFixture(t)

	const (
		corpRef = "corp_56_JxK"
		session = "sess-shared"
	)
	writer := f.orgClient("writer-tab", "acct-member", []string{corpRef}, nil)
	sibling := f.orgClient("sibling-tab", "acct-member", []string{corpRef}, nil)
	writer.SessionID = session
	sibling.SessionID = session

	out := audienceOutbound(subscribersMessage(
		models.Owner{Kind: models.OwnerCorporation, ID: corpRef}, audienceFrame("archiveStatsProcessed")))
	out.Source = Source{ClientID: writer.id, SessionID: session}

	if outcome := f.Server.deliverOutbound(out); outcome.RecipientCount != 1 {
		t.Fatalf("recipients = %d, want only the sibling", outcome.RecipientCount)
	}
	if got := receivedFrames(t, writer); len(got) != 0 {
		t.Fatalf("the connection that caused the message received %d frames back", len(got))
	}
	if got := receivedFrames(t, sibling); len(got) != 1 {
		t.Fatalf("the sibling received %d frames, want 1", len(got))
	}
}

// A family the table does not hold is refused rather than fanned out on a
// default. A policy nobody wrote is not a policy, and delivering on one would
// give a new family whatever gates the last one happened to need.
func TestAFamilyWithNoPolicyIsRefused(t *testing.T) {
	f := newIntegFixture(t)
	c := f.orgClient("a-tab", "acct-any", nil, nil)

	out := audienceOutbound(everyoneMessage(audienceFrame("somethingNew")))
	out.Family = "aFamilyNobodyWroteARowFor"

	outcome := f.Server.deliverOutbound(out)
	if outcome.Undeliverable != "unknown_family" {
		t.Fatalf("undeliverable = %q, want unknown_family", outcome.Undeliverable)
	}
	if outcome.RecipientCount != 0 {
		t.Fatalf("recipients = %d, want nothing delivered", outcome.RecipientCount)
	}
	if got := receivedFrames(t, c); len(got) != 0 {
		t.Fatalf("a client received %d frames for a family with no policy", len(got))
	}
}

// A message with no frame reaches nobody rather than queueing an empty one,
// which a browser would read as a message it cannot parse.
func TestAMessageWithNoFrameReachesNobody(t *testing.T) {
	f := newIntegFixture(t)
	c := f.orgClient("a-tab", "acct-any", nil, nil)

	out := audienceOutbound(everyoneMessage(nil))
	if outcome := f.Server.deliverOutbound(out); outcome.RecipientCount != 0 || outcome.Undeliverable != "" {
		t.Fatalf("recipients=%d undeliverable=%q, want an empty delivery and no defect",
			outcome.RecipientCount, outcome.Undeliverable)
	}
	if got := receivedFrames(t, c); len(got) != 0 {
		t.Fatalf("a client was queued %d empty frames", len(got))
	}
}
