// Package redisfake gives a test an in-process Redis and a client wired to it.
//
// Both are closed when the test ends. Most tests only need Client; reach for
// Server to manipulate the store directly (TTL, FastForward, Exists).
//
// Note for simulated time: miniredis listens on loopback TCP, so a client call
// is real network I/O and never counts as durably blocked. A test using this
// fixture cannot run inside a testing/synctest bubble. If that is ever needed,
// this constructor is the one place to change.
package redisfake

import (
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// Redis is a fake Redis bound to a test.
type Redis struct {
	Server *miniredis.Miniredis
	Client *redis.Client
}

// New starts a fake Redis; cleanup closes the client and the server.
func New(t testing.TB) *Redis {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return &Redis{Server: server, Client: client}
}

// Addr is the fake's listen address, for callers that build their own client.
func (r *Redis) Addr() string { return r.Server.Addr() }
