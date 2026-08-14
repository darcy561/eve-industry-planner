package server

import (
	"net/http"
	"testing"
	"time"
)

// Soft at target is reflected on /placement and still allows a real upgrade.
func TestIntegrationSoftHintDoesNotRefuseUpgrade(t *testing.T) {
	f := newIntegFixture(t)
	f.setPlacementLimits(1, 10)
	f.register(f.newClient("c1", "acct-load", nil, nil))
	f.syncPlacementHints()
	f.requirePlacement(true, false, 1)

	f.seedSession("acct-new", "sess-soft")
	conn := f.dial("sess-soft")
	msg := f.readJSONMessage(conn, 2*time.Second)
	if got, _ := msg["type"].(string); got != "connected" {
		t.Fatalf("soft must allow upgrade; type=%v msg=%v", msg["type"], msg)
	}
	f.waitClients(2, 2*time.Second)
}

// Soft + full together: at cutoff refuses a dial; /placement shows both flags.
func TestIntegrationCutoffRefusesWhileSoftAlsoSet(t *testing.T) {
	f := newIntegFixture(t)
	f.setPlacementLimits(1, 2)
	f.register(f.newClient("a", "acct-a", nil, nil))
	f.register(f.newClient("b", "acct-b", nil, nil))
	f.syncPlacementHints()
	f.requirePlacement(true, true, 2)

	f.seedSession("acct-blocked", "sess-cut")
	status, body := f.dialRefuse("sess-cut")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 body=%q", status, body)
	}
	if !stringContainsFold(body, "at_cutoff") {
		t.Fatalf("body=%q", body)
	}
}

// Full/cutoff refuses newcomers but keeps an already-connected socket.
func TestIntegrationCutoffKeepsLiveSocket(t *testing.T) {
	f := newIntegFixture(t)
	f.setPlacementLimits(1, 2)
	f.seedSession("acct-live", "sess-live-cut")
	conn := f.dial("sess-live-cut")
	_ = f.readJSONMessage(conn, 2*time.Second)
	f.waitClients(1, 2*time.Second)

	f.seedSession("acct-2", "sess-2")
	conn2 := f.dial("sess-2")
	_ = f.readJSONMessage(conn2, 2*time.Second)
	f.waitClients(2, 2*time.Second)
	f.syncPlacementHints()
	f.requirePlacement(true, true, 2)

	f.seedSession("acct-blocked", "sess-blocked")
	status, body := f.dialRefuse("sess-blocked")
	if status != http.StatusServiceUnavailable || !stringContainsFold(body, "at_cutoff") {
		t.Fatalf("status=%d body=%q", status, body)
	}

	if f.Server.ConnectedCount() != 2 {
		t.Fatalf("cutoff must not kick existing; count=%d", f.Server.ConnectedCount())
	}
	_ = conn.SetWriteDeadline(time.Now().Add(time.Second))
	if err := conn.WriteMessage(1, []byte(`{"type":"ping"}`)); err != nil {
		t.Fatalf("live socket should still accept writes: %v", err)
	}
}
