package server

import (
	"encoding/json"
	"testing"
	"time"

	"eve-industry-planner/shared/models"
	eipnats "eve-industry-planner/shared/nats"
)

// everyoneMessage addresses a frame to every socket.
func everyoneMessage(frame []byte) eipnats.AudienceMessage {
	return eipnats.AudienceMessage{
		Audience: eipnats.AudienceEveryone,
		Target:   eipnats.TargetEveryone,
		Subtype:  eipnats.SubtypeStaticDataBuildUpdated,
		Payload:  frame,
	}
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

	recipients, routed := f.Server.deliverToAudience(everyoneMessage(staticDataFrame(t, 42, "2026-09-13")))
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

	recipients, routed := f.Server.deliverToAudience(eipnats.AudienceMessage{
		Audience: eipnats.AudienceSubscribers,
		Target:   models.Owner{Kind: models.OwnerCorporation, ID: corpRef}.Key(),
		Subtype:  "archiveStatsProcessed",
		Payload:  audienceFrame("archiveStatsProcessed"),
	})
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

	recipients, routed := f.Server.deliverToAudience(eipnats.AudienceMessage{
		Audience: eipnats.AudienceSubscribers,
		Target:   models.AccountOwner("acct-owner").Key(),
		Subtype:  "archiveStatsProcessed",
		Payload:  audienceFrame("archiveStatsProcessed"),
	})
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

	if recipients, routed := f.Server.deliverToAudience(eipnats.AudienceMessage{
		Audience: eipnats.Audience("members"),
		Target:   models.AccountOwner("acct-any").Key(),
		Subtype:  "somethingHappened",
		Payload:  audienceFrame("somethingHappened"),
	}); routed || recipients != 0 {
		t.Fatalf("routed=%v recipients=%d, want an unrouted report", routed, recipients)
	}
}

// A target that names no owner reaches nothing rather than falling through to a
// shared bucket, which is what an unparsed key would address.
func TestSubscribersAudienceWithAnUnreadableTargetReachesNothing(t *testing.T) {
	f := newIntegFixture(t)
	c := f.orgClient("a-tab", "acct-any", nil, nil)

	recipients, routed := f.Server.deliverToAudience(eipnats.AudienceMessage{
		Audience: eipnats.AudienceSubscribers,
		Target:   "not-an-owner-key",
		Subtype:  "archiveStatsProcessed",
		Payload:  audienceFrame("archiveStatsProcessed"),
	})
	if !routed || recipients != 0 {
		t.Fatalf("routed=%v recipients=%d, want nothing delivered", routed, recipients)
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

	if sent, routed := f.Server.deliverToAudience(everyoneMessage(staticDataFrame(t, 42, "2026-09-13"))); !routed || sent != 1 {
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
		sent, _ := f.Server.deliverToAudience(everyoneMessage(staticDataFrame(t, 9, "2026-09-13")))
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
