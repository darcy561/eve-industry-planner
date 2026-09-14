package nats_test

import (
	"encoding/json"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/testing/natsfake"
)

// waitForFrame reports the next frame handed to a subscriber, or that none came.
func waitForFrame(t *testing.T, frames <-chan eipnats.AudienceMessage, within time.Duration) (eipnats.AudienceMessage, bool) {
	t.Helper()
	select {
	case msg := <-frames:
		return msg, true
	case <-time.After(within):
		return eipnats.AudienceMessage{}, false
	}
}

// subscribeAudience wires a subscriber to a channel of what it receives.
func subscribeAudience(t *testing.T, n *eipnats.NATS) <-chan eipnats.AudienceMessage {
	t.Helper()
	frames := make(chan eipnats.AudienceMessage, 4)
	stop, err := eipnats.SubscribeAudience(n, func(msg eipnats.AudienceMessage) {
		frames <- msg
	})
	if err != nil {
		t.Fatalf("SubscribeAudience: %v", err)
	}
	t.Cleanup(stop)
	return frames
}

// A frame published to an audience arrives with the audience and target it was
// addressed to, and with its body byte for byte: the subject carries the routing
// and the body is forwarded unread.
func TestAudienceMessageArrivesAsPublished(t *testing.T) {
	fake := natsfake.New(t)
	frames := subscribeAudience(t, fake.NATS)

	body := []byte(`{"type":"staticData","buildNumber":42}`)
	if err := eipnats.PublishToAudience(fake.NATS, eipnats.Everyone(), "sdeBuildUpdated", body); err != nil {
		t.Fatalf("PublishToAudience: %v", err)
	}

	got, ok := waitForFrame(t, frames, 2*time.Second)
	if !ok {
		t.Fatal("nothing arrived on the audience subscription")
	}
	if got.Audience != eipnats.AudienceEveryone {
		t.Fatalf("audience = %q", got.Audience)
	}
	if got.Target != eipnats.TargetEveryone || got.Subtype != "sdeBuildUpdated" {
		t.Fatalf("target/subtype = %q/%q", got.Target, got.Subtype)
	}
	if string(got.Payload) != string(body) {
		t.Fatalf("payload = %q, want %q", got.Payload, body)
	}
}

// An owner-addressed message carries the owner key through untouched, which is
// what the delivery side indexes on.
func TestAudienceMessageCarriesTheOwnerItAddresses(t *testing.T) {
	fake := natsfake.New(t)
	frames := subscribeAudience(t, fake.NATS)

	const ownerKey = "corporation:corp_56_JxK"
	if err := eipnats.PublishToAudience(fake.NATS, eipnats.Subscribers(ownerKey), "archiveStatsProcessed", []byte(`{"type":"notification"}`)); err != nil {
		t.Fatalf("PublishToAudience: %v", err)
	}

	got, ok := waitForFrame(t, frames, 2*time.Second)
	if !ok {
		t.Fatal("nothing arrived on the audience subscription")
	}
	if got.Audience != eipnats.AudienceSubscribers || got.Target != ownerKey {
		t.Fatalf("addressed to %q/%q", got.Audience, got.Target)
	}
}

// The audience space is disjoint from the internal topics on a live server, not
// only by inspection. The static data build topic still carries the event the
// API cache and the core metric derive from, and it must never reach a socket.
func TestTheAudiencePathDoesNotSeeInternalTopicMessages(t *testing.T) {
	fake := natsfake.New(t)
	audience := subscribeAudience(t, fake.NATS)

	builds := make(chan eipnats.SDECurrentBuildUpdate, 4)
	stopBuilds, err := eipnats.SubscribeSDEBuildUpdated(fake.NATS, func(u eipnats.SDECurrentBuildUpdate) {
		builds <- u
	})
	if err != nil {
		t.Fatalf("SubscribeSDEBuildUpdated: %v", err)
	}
	t.Cleanup(stopBuilds)

	if err := eipnats.PublishSDEBuildUpdated(fake.NATS, 42, "2026-09-13"); err != nil {
		t.Fatalf("PublishSDEBuildUpdated: %v", err)
	}
	select {
	case <-builds:
	case <-time.After(2 * time.Second):
		t.Fatal("the internal event never reached its own subscriber")
	}
	if got, ok := waitForFrame(t, audience, 300*time.Millisecond); ok {
		t.Fatalf("an internal topic message reached the audience subscriber as %+v", got)
	}

	if err := eipnats.AnnounceStaticDataBuild(fake.NATS, 42, "2026-09-13"); err != nil {
		t.Fatalf("AnnounceStaticDataBuild: %v", err)
	}
	if _, ok := waitForFrame(t, audience, 2*time.Second); !ok {
		t.Fatal("the announcement never reached the audience subscriber")
	}
	select {
	case got := <-builds:
		t.Fatalf("an announcement reached the internal subscriber as %+v", got)
	case <-time.After(300 * time.Millisecond):
	}
}

// A notification is addressed to the people working in an owner, and arrives as
// the enveloped frame a browser reads.
func TestANotificationIsAddressedToItsOwnersSubscribers(t *testing.T) {
	fake := natsfake.New(t)
	frames := subscribeAudience(t, fake.NATS)

	const ownerKey = "corporation:corp_56_JxK"
	body := eipnats.ArchiveStatsProcessedNotification{
		OwnerKind:   "corporation",
		OwnerID:     "corp_56_JxK",
		ProcessedAt: "2026-09-13T00:00:00Z",
	}
	if err := eipnats.PublishNotification(fake.NATS, ownerKey, eipnats.NotificationArchiveStatsProcessed, body); err != nil {
		t.Fatalf("PublishNotification: %v", err)
	}

	got, ok := waitForFrame(t, frames, 2*time.Second)
	if !ok {
		t.Fatal("nothing arrived on the audience subscription")
	}
	if got.Audience != eipnats.AudienceSubscribers || got.Target != ownerKey {
		t.Fatalf("addressed to %q/%q, want the owner's subscribers", got.Audience, got.Target)
	}

	var frame struct {
		Type    string          `json:"type"`
		Subtype string          `json:"subtype"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(got.Payload, &frame); err != nil {
		t.Fatalf("the frame is not the envelope a browser reads: %v", err)
	}
	if frame.Type != eipnats.ClientMessageNotification || frame.Subtype != eipnats.NotificationArchiveStatsProcessed {
		t.Fatalf("frame = %+v", frame)
	}
}
