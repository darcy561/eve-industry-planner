package server

import (
	"encoding/json"
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"
)

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

// The socket has to stay up: a client told about a new build carries on with the
// session it was in, unlike a maintenance window where the close is the point.
func TestStaticDataAnnouncementLeavesTheSocketOpen(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-sde", "sess-sde-1")
	conn := f.dial("sess-sde-1")
	defer func() { _ = conn.Close() }()
	_ = f.readJSONMessage(conn, 2*time.Second) // connected
	f.waitClients(1, 2*time.Second)

	if sent := f.Server.broadcastRawToEveryClient(staticDataFrame(t, 42, "2026-09-13")); sent != 1 {
		t.Fatalf("sent = %d, want 1", sent)
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

// The files are the same for everyone, so the fan-out is not filtered by account
// the way every other broadcast here is.
func TestStaticDataAnnouncementReachesEveryAccount(t *testing.T) {
	f := newIntegFixture(t)

	first := f.newClient("sde-client-1", "acct-one", nil, nil)
	second := f.newClient("sde-client-2", "acct-two", nil, nil)
	f.register(first)
	f.register(second)
	defer f.unregister(first)
	defer f.unregister(second)

	if sent := f.Server.broadcastRawToEveryClient(staticDataFrame(t, 7, "2026-09-13")); sent != 2 {
		t.Fatalf("sent = %d, want 2: an announcement for everyone reached fewer accounts", sent)
	}
	for name, c := range map[string]*Client{"first": first, "second": second} {
		select {
		case <-c.Send:
		default:
			t.Errorf("%s client was queued nothing", name)
		}
	}
}

// A client that cannot take the message is skipped rather than waited for: the
// announcement is a shortcut, and blocking the fan-out on one stalled socket
// would cost every other client its news.
func TestStaticDataAnnouncementSkipsAFullBuffer(t *testing.T) {
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
	go func() { done <- f.Server.broadcastRawToEveryClient(staticDataFrame(t, 9, "2026-09-13")) }()

	select {
	case sent := <-done:
		if sent != 1 {
			t.Fatalf("sent = %d, want 1: only the client with room should have taken it", sent)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the fan-out blocked on a client that could not take the message")
	}
}
