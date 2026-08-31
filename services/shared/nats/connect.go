package nats

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/core/config"
	"eve-industry-planner/shared/logs"

	natslib "github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// ConnectRetry bounds boot-time connection attempts.
var ConnectRetry = RetryPolicy{Attempts: 5, InitialDelay: 5 * time.Second, MaxDelay: 5 * time.Second}

const (
	connectTimeout = 5 * time.Second
	// jetStreamAPITimeout applies only when a caller's context carries no deadline.
	jetStreamAPITimeout = 5 * time.Second
)

// Connect establishes a connection, retrying while ctx allows.
func Connect(ctx context.Context) (*natslib.Conn, error) {
	natsURL, err := config.NATSURL()
	if err != nil {
		return nil, err
	}

	opts := []natslib.Option{
		natslib.ReconnectWait(2 * time.Second),
		natslib.MaxReconnects(-1),
		natslib.ReconnectOnFlusherError(),
		natslib.Timeout(connectTimeout),
		natslib.DisconnectErrHandler(func(_ *natslib.Conn, err error) {
			if err != nil {
				logs.WarnCtx(ctx, "NATS disconnected", "error", err)
			}
		}),
		natslib.ReconnectHandler(func(nc *natslib.Conn) {
			logs.InfoCtx(ctx, "NATS reconnected", "url", nc.ConnectedUrl())
		}),
		natslib.ReconnectErrHandler(func(_ *natslib.Conn, err error) {
			if err != nil {
				logs.WarnCtx(ctx, "NATS reconnect attempt failed", "error", err)
			}
		}),
		natslib.ErrorHandler(func(_ *natslib.Conn, _ *natslib.Subscription, err error) {
			if err != nil {
				logs.ErrorCtx(ctx, "NATS error", "error", err)
			}
		}),
	}

	var conn *natslib.Conn
	err = Retry(ctx, ConnectRetry, "nats connect", func() error {
		c, connErr := natslib.Connect(natsURL, opts...)
		if connErr != nil {
			return connErr
		}
		conn = c
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("connect to NATS: %w", err)
	}
	logs.DebugCtx(ctx, "connected to NATS", "url", conn.ConnectedUrl())
	return conn, nil
}

// Open establishes a connection and returns the handle bound to it.
func Open(ctx context.Context) (*NATS, error) {
	conn, err := Connect(ctx)
	if err != nil {
		return nil, err
	}

	js, err := getJetStream(conn)
	if err != nil {
		conn.Close()
		return nil, err
	}

	handle, err := NewNATS(conn, js)
	if err != nil {
		conn.Close()
		return nil, err
	}
	return handle, nil
}

// GetJetStream returns a JetStream context from the connection using the new API.
// Use this when you already have a connection.
// Note: JetStream contexts automatically work with NATS connection reconnection.
// If the connection is reconnected, JetStream operations will automatically use the
// reconnected connection without needing to recreate the context.
func getJetStream(conn *natslib.Conn) (jetstream.JetStream, error) {
	js, err := jetstream.New(conn,
		jetstream.WithDefaultTimeout(jetStreamAPITimeout),
		jetstream.WithPublishAsyncTimeout(asyncPublishTimeout))
	if err != nil {
		return nil, fmt.Errorf("failed to get JetStream context: %w", err)
	}
	return js, nil
}
