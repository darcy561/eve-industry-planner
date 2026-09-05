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
	defaultClientCutoff          = 2000
	defaultTargetClients         = 1500
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

// ClientCutoff is the hard per-replica client count for placement full + upgrade refuse.
// 0 means unlimited (never mark the backend full / never refuse for cutoff).
func ClientCutoff() int {
	v := strings.TrimSpace(os.Getenv("WS_CLIENT_CUTOFF"))
	if v == "" {
		return defaultClientCutoff
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultClientCutoff
	}
	return n
}

// AtClientCutoff reports whether connected clients have reached the cutoff.
func AtClientCutoff(connected int) bool {
	cutoff := ClientCutoff()
	return cutoff > 0 && connected >= cutoff
}

// TargetClients is the soft per-replica client count for placement soft divert.
// 0 means soft divert off (never mark soft).
func TargetClients() int {
	v := strings.TrimSpace(os.Getenv("WS_TARGET_CLIENTS"))
	if v == "" {
		return defaultTargetClients
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return defaultTargetClients
	}
	return n
}

// AtTargetClients reports whether connected clients have reached the soft target.
func AtTargetClients(connected int) bool {
	target := TargetClients()
	return target > 0 && connected >= target
}

// AllowedOrigins returns the browser origins permitted to open a WebSocket, lowercased.
// Set by the operator via EIP_ALLOWED_ORIGINS (comma-separated); a single "*" allows any
// origin. Unset or empty returns nil, which refuses every browser origin.
func AllowedOrigins() []string {
	v := strings.TrimSpace(os.Getenv("EIP_ALLOWED_ORIGINS"))
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.ToLower(strings.TrimSpace(p)); p != "" {
			out = append(out, strings.TrimSuffix(p, "/"))
		}
	}
	return out
}
