package server

import "time"

const (
	// Cleanup configuration
	CleanupInterval           = 1 * time.Minute
	IdleQueueTimeout          = 2 * time.Minute
	ActiveSubscriptionTimeout = 1 * time.Minute // Remove active subscriptions older than this (logout vs disconnect)
	IterationFallbackDelay    = 100 * time.Millisecond
)
