package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	// Queue configuration.
	QueueBufferSize     = 200
	SignalChannelBuffer = 1000

	// Connection configuration.
	WriteWait  = 10 * time.Second
	PongWait   = 90 * time.Second
	PingPeriod = 1 * time.Minute

	// Cleanup configuration.
	CleanupInterval           = 1 * time.Minute
	IdleQueueTimeout          = 2 * time.Minute
	ActiveSubscriptionTimeout = 1 * time.Minute
	IterationFallbackDelay    = 100 * time.Millisecond

	// Security configuration.
	defaultMaxConnectionsPerUser = 5
	defaultSlotClientCutoff      = 2000
	MessageRateLimit             = 200
	MessageRateWindow            = 1 * time.Second

	// Sync pool configuration.
	SyncPoolSize = 20

	// Doc update outbound: sharded queues route by account / corporation / alliance so each shard
	// preserves FIFO for that scope while different scopes process in parallel (per replica).
	DocUpdateOutboundShardCount    = 32
	DocUpdateOutboundShardQueueCap = 128 // per shard; inline fallback if a shard is full

	// Session handoff timing; keep in sync with frontend reconnect constants.
	WSReconnectMaxMS        = 20_000
	WSSessionHandoffSlackMS = 5_000
)

// MaxConnectionsPerUser returns the concurrent WebSocket cap per account.
// Default is defaultMaxConnectionsPerUser; set WS_MAX_CONNECTIONS_PER_USER for load tests or special deployments.
func MaxConnectionsPerUser() int {
	const hardMax = 50000
	v := strings.TrimSpace(os.Getenv("WS_MAX_CONNECTIONS_PER_USER"))
	if v == "" {
		return defaultMaxConnectionsPerUser
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > hardMax {
		return defaultMaxConnectionsPerUser
	}
	return n
}

// SessionHandoffTTL is used for Redis key TTL and in-memory handoff expiry.
var SessionHandoffTTL = time.Duration(WSReconnectMaxMS+WSSessionHandoffSlackMS) * time.Millisecond

// SlotClientCutoff is the soft per-replica client count used for placement hints
// (eip:ws:full:…). 0 means unlimited (never mark the slot full).
func SlotClientCutoff() int {
	v := strings.TrimSpace(os.Getenv("WS_SLOT_CLIENT_CUTOFF"))
	if v == "" {
		return defaultSlotClientCutoff
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultSlotClientCutoff
	}
	return n
}

// SlotAtClientCutoff reports whether connected clients have reached the cutoff.
func SlotAtClientCutoff(connected int) bool {
	cutoff := SlotClientCutoff()
	return cutoff > 0 && connected >= cutoff
}
