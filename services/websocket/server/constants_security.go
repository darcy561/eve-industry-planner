package server

import "time"

const (
	// Security configuration
	MaxConnectionsPerUser = 5   // Maximum concurrent connections per user
	MessageRateLimit      = 200 // Maximum messages per second per connection
	MessageRateWindow     = 1 * time.Second
)
