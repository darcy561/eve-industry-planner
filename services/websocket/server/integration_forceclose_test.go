package server

import (
	"context"
	"testing"
	"time"
)

// Real HandleWS connect + DrainForRoll: please_reconnect on wire, then socket closes.
func TestIntegrationDrainForRollClosesLiveSocket(t *testing.T) {
	f := newIntegFixture(t)
	f.seedSession("acct-live", "sess-live-1")
	conn := f.dial("sess-live-1")
	_ = f.readJSONMessage(conn, 2*time.Second) // connected
	f.waitClients(1, 2*time.Second)

	done := make(chan struct{})
	go func() {
		f.Server.DrainForRoll(context.Background())
		close(done)
	}()

	msg := f.readJSONOfType(conn, "please_reconnect", 3*time.Second)
	if got, _ := msg["action"].(string); got != "roll" {
		t.Fatalf("action=%v want roll full=%v", msg["action"], msg)
	}
	if got, _ := msg["via"].(string); got != "sigterm" {
		t.Fatalf("via=%v want sigterm full=%v", msg["via"], msg)
	}

	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, readErr := conn.ReadMessage()
	if readErr == nil {
		t.Fatal("expected read error after force-close")
	}

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("DrainForRoll did not finish")
	}
	if !f.Server.IsDraining() {
		t.Fatal("expected draining")
	}
	f.waitClients(0, 2*time.Second)
}
