// Package redisfake gives a test an in-process Redis and a client wired to it.
//
// Both are closed when the test ends. Most tests only need Client; reach for
// Server to manipulate the store directly (TTL, FastForward, Exists).
//
// New listens on loopback TCP, so a client call is real network I/O that never
// counts as durably blocked and would deadlock a testing/synctest bubble. A test
// that needs simulated time takes NewForBubble instead.
package redisfake

import (
	"context"
	"net"
	"testing"
	"testing/synctest"
	"time"

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

// NewForBubble starts a fake Redis a test can drive from inside a
// testing/synctest bubble, reached over net.Pipe rather than a socket.
//
// Call it OUTSIDE the bubble and use the client inside:
//
//	r := redisfake.NewForBubble(t)
//	synctest.Test(t, func(t *testing.T) { ... r.Client ... })
//
// Three things have to hold, and each one was a failure before it was a rule.
//
// The server, the client and every connection are established here, before the
// bubble opens: a dial from inside starts miniredis goroutines outside it, and
// the mismatch is a fatal "WaitGroup.Add called from inside and outside synctest
// bubble". The transport is a pipe, so no call reaches the network, where a
// bubble would never advance its clock.
//
// And the pool is warmed to bubbleConns rather than pinned to one connection.
// go-redis keeps a package-level sync.Pool of timers that its semaphore reaches
// for only when a caller has to wait for a connection. A timer taken inside one
// bubble goes back into that shared pool and is reused by the next test's
// bubble, which aborts the run with "select on synctest channel from outside
// bubble". Spare connections keep every acquire on the fast path, where no timer
// is taken at all. A test needing more concurrency than this raises the number.
const bubbleConns = 16

func NewForBubble(t testing.TB) *Redis {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{
		PoolSize: bubbleConns,
		Dialer: func(context.Context, string, string) (net.Conn, error) {
			ours, theirs := net.Pipe()
			go server.Server().ServeConn(theirs)
			return ours, nil
		},
	})
	t.Cleanup(func() { _ = client.Close() })

	// Hold every connection at once so the pool actually creates them all, and
	// take them one at a time: go-redis races on its own connection setup when
	// several goroutines initialise connections together, which shows up under
	// -race with no product code involved.
	ctx := context.Background()
	held := make([]*redis.Conn, 0, bubbleConns)
	for range bubbleConns {
		conn := client.Conn()
		if err := conn.Ping(ctx).Err(); err != nil {
			t.Fatalf("redisfake: warming a pooled connection: %v", err)
		}
		held = append(held, conn)
	}
	for _, conn := range held {
		_ = conn.Close()
	}
	if got := client.PoolStats().TotalConns; got < bubbleConns {
		t.Fatalf("redisfake: warmed %d of %d connections; a dial inside the bubble would abort the test", got, bubbleConns)
	}
	return &Redis{Server: server, Client: client}
}

// Advance moves the bubble's clock and the fake's own clock together, and must
// be called from inside the bubble.
//
// They are two clocks. Simulated time fires the caller's timers; a key's TTL is
// held by miniredis, which only ages on FastForward. Sleeping the whole span
// first would let a renewal loop run several times against a store where no time
// had passed, so a lease under test would never expire. Stepping keeps the two
// within one step of each other.
func (r *Redis) Advance(d time.Duration) {
	const step = 250 * time.Millisecond
	for left := d; left > 0; left -= step {
		this := min(step, left)
		r.Server.FastForward(this)
		time.Sleep(this)
		synctest.Wait()
	}
}
