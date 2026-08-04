package server

import (
	"testing"
	"time"
)

// Real HandleWS upgrade with seeded Redis session → connected frame + hosted account.
func TestIntegrationConnectReceivesConnected(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-connect", "sess-connect-1")

	conn := f.dial("sess-connect-1")
	msg := f.readJSONMessage(conn, 2*time.Second)
	if got, _ := msg["type"].(string); got != "connected" {
		t.Fatalf("type=%v want connected full=%v", msg["type"], msg)
	}
	clientID, _ := msg["clientID"].(string)
	if clientID == "" {
		t.Fatalf("missing clientID in %v", msg)
	}

	f.waitClients(1, 2*time.Second)
	if !f.Server.HostsTenant("account:acct-connect") {
		t.Fatalf("hosted=%v", f.Server.HostedTenants())
	}

	_ = conn.Close()
	f.waitClients(0, 2*time.Second)
	if f.Server.HostsTenant("account:acct-connect") {
		t.Fatal("account should clear after disconnect")
	}
}

func TestIntegrationConnectMissingSessionUnauthorized(t *testing.T) {
	f := newIntegFixture(t)
	status, body := f.dialRefuse("no-such-session")
	if status != 401 {
		t.Fatalf("status=%d body=%q want 401", status, body)
	}
}

func TestIntegrationConnectRefusedWhileDraining(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-d", "sess-d")
	f.Server.draining.Store(true)

	status, body := f.dialRefuse("sess-d")
	if status != 503 {
		t.Fatalf("status=%d body=%q want 503", status, body)
	}
	if !stringContainsFold(body, "draining") {
		t.Fatalf("body=%q", body)
	}
}
