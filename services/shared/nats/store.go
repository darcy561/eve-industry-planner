package nats

import (
	"context"
	"fmt"
	"time"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// pingTimeout applies only when a caller's context carries no deadline.
const pingTimeout = 5 * time.Second

// NATS is the app messaging handle: one connection and the JetStream context bound to it.
type NATS struct {
	conn *natslib.Conn
	js   jetstream.JetStream
}

// NewNATS binds a connection and its JetStream context.
func NewNATS(conn *natslib.Conn, js jetstream.JetStream) (*NATS, error) {
	if conn == nil {
		return nil, fmt.Errorf("nats connection is required")
	}
	if js == nil {
		return nil, fmt.Errorf("jetstream context is required")
	}
	return &NATS{conn: conn, js: js}, nil
}

// Conn returns the raw connection for core-NATS subscribe / request / reply.
func (n *NATS) Conn() *natslib.Conn {
	if n == nil {
		return nil
	}
	return n.conn
}

// JS returns the JetStream context (stream and consumer management).
func (n *NATS) JS() jetstream.JetStream {
	if n == nil {
		return nil
	}
	return n.js
}

// Connected reports link state; the client reconnects on its own, so false is not terminal.
func (n *NATS) Connected() bool {
	return n != nil && n.conn != nil && n.conn.IsConnected()
}

// Ping round-trips to the server rather than trusting the connection's own state.
func (n *NATS) Ping(ctx context.Context) error {
	if n == nil || n.conn == nil {
		return fmt.Errorf("nats connection is required")
	}
	if !n.conn.IsConnected() {
		return fmt.Errorf("nats not connected")
	}
	// FlushWithContext rejects a context with no deadline.
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, pingTimeout)
		defer cancel()
	}
	if err := n.conn.FlushWithContext(ctx); err != nil {
		return fmt.Errorf("nats ping: %w", err)
	}
	return nil
}

// Close drains and closes the connection.
func (n *NATS) Close() {
	if n == nil || n.conn == nil {
		return
	}
	_ = n.conn.Drain()
	n.conn.Close()
}
