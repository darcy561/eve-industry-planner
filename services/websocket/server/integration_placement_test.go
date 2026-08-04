package server

import (
	"net/http"
	"testing"
	"time"
)

// Soft at target sets Redis soft and still allows a real upgrade (hard refuse stays cutoff/cordon/drain).
func TestIntegrationSoftHintDoesNotRefuseUpgrade(t *testing.T) {
	f := newIntegFixture(t)
	f.setSlotLimits(1, 10)
	f.register(f.newClient("c1", "acct-load", nil, nil))
	f.syncPlacementHints()
	f.requireRedisValue(f.softKey(), "1")
	f.requireRedisAbsent(f.fullKey())

	f.seedSession("acct-new", "sess-soft")
	conn := f.dial("sess-soft")
	msg := f.readJSONMessage(conn, 2*time.Second)
	if got, _ := msg["type"].(string); got != "connected" {
		t.Fatalf("soft must allow upgrade; type=%v msg=%v", msg["type"], msg)
	}
	f.waitClients(2, 2*time.Second)
}

// Soft + full together: at cutoff refuses a dial; soft key may also be present.
func TestIntegrationCutoffRefusesWhileSoftAlsoSet(t *testing.T) {
	f := newIntegFixture(t)
	f.setSlotLimits(1, 2)
	f.register(f.newClient("a", "acct-a", nil, nil))
	f.register(f.newClient("b", "acct-b", nil, nil))
	f.syncPlacementHints()
	f.requireRedisValue(f.softKey(), "1")
	f.requireRedisValue(f.fullKey(), "1")

	f.seedSession("acct-blocked", "sess-cut")
	status, body := f.dialRefuse("sess-cut")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want 503 body=%q", status, body)
	}
	if !stringContainsFold(body, "at_cutoff") {
		t.Fatalf("body=%q", body)
	}
}
