package server

import "time"

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 90 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = 1 * time.Minute

	// Maximum message size allowed from peer.
	maxMessageSize = 512 * 1024

	// Idle connection configuration
	// IdleTimeout is longer than pongWait to account for network delays
	// Connections with no activity (pong or message) for this duration are considered idle
	IdleConnectionTimeout = 2 * time.Minute // Longer than pongWait to allow for network delays
)

