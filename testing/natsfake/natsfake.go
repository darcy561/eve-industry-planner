// Package natsfake gives a test an in-process NATS server with JetStream
// enabled, and the product handle wired to it.
//
// Everything is torn down when the test ends. Most tests only need NATS; reach
// for Conn or JS when a helper still takes the raw client, and for Server to
// manipulate the server directly.
package natsfake

import (
	"testing"
	"time"

	eipnats "eve-industry-planner/shared/nats"

	natsserver "github.com/nats-io/nats-server/v2/server"
	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// readyTimeout bounds how long the embedded server may take to accept connections.
const readyTimeout = 5 * time.Second

// NATS is an embedded server and the product handle bound to it.
type NATS struct {
	Server *natsserver.Server
	NATS   *eipnats.NATS
}

// New starts an embedded JetStream server; cleanup closes the handle and stops
// the server. Storage is a per-test temporary directory, so streams never
// outlive the test that created them.
func New(t testing.TB) *NATS {
	t.Helper()

	server, err := natsserver.NewServer(&natsserver.Options{
		Host:      "127.0.0.1",
		Port:      -1,
		JetStream: true,
		StoreDir:  t.TempDir(),
	})
	if err != nil {
		t.Fatalf("natsfake: new server: %v", err)
	}
	go server.Start()
	if !server.ReadyForConnections(readyTimeout) {
		server.Shutdown()
		t.Fatalf("natsfake: server not ready within %s", readyTimeout)
	}

	conn, err := natslib.Connect(server.ClientURL())
	if err != nil {
		server.Shutdown()
		t.Fatalf("natsfake: connect: %v", err)
	}
	js, err := jetstream.New(conn)
	if err != nil {
		conn.Close()
		server.Shutdown()
		t.Fatalf("natsfake: jetstream: %v", err)
	}
	handle, err := eipnats.NewNATS(conn, js)
	if err != nil {
		conn.Close()
		server.Shutdown()
		t.Fatalf("natsfake: handle: %v", err)
	}

	t.Cleanup(func() {
		conn.Close()
		server.Shutdown()
	})
	return &NATS{Server: server, NATS: handle}
}

// Conn is the raw connection, for helpers that still take one.
func (n *NATS) Conn() *natslib.Conn { return n.NATS.Conn() }

// JS is the raw JetStream context, for stream and consumer helpers.
func (n *NATS) JS() jetstream.JetStream { return n.NATS.JS() }

// URL is the embedded server's client URL, for callers building their own connection.
func (n *NATS) URL() string { return n.Server.ClientURL() }
