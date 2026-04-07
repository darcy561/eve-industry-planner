package sync

import (
	"context"
	"sync"
	"time"
)

// SyncQueue handles sync requests per client
// One sync per client at a time (enforced by queue)
type SyncQueue struct {
	Ch      chan SyncMessage // Buffered channel for sync messages
	Mu      sync.RWMutex     // Protects queue operations
	LastUse time.Time        // Last time queue was accessed
}

// SyncMessage represents a sync request from a client
type SyncMessage struct {
	ClientID      string              // Client ID that sent the sync request
	AccountID     string              // Account ID (for validation)
	Type          string              // "sync" (sync_drop removed)
	Subscriptions map[string][]string // Grouped by collection: { "users": ["id1"], "jobs": ["id2"] }
}

// SyncServer interface defines what sync package needs from Server
// This avoids import cycles - websocket package implements this interface
type SyncServer interface {
	GetSyncQueues() map[string]*SyncQueue
	GetSyncSignals() chan string
	GetSyncMu() interface {
		Lock()
		Unlock()
	}
	GetClients() map[string]SyncClient
	GetClientsMu() interface {
		RLock()
		RUnlock()
	}
	GetSyncPool() interface {
		SubmitErr(func() error) interface{}
	}
	// GetMongoClient returns the MongoDB client for querying documents
	// Returns nil if MongoDB is not available
	GetMongoClient() interface{} // *mongo.Client (avoiding direct import in interface)
	// ReplaceClientSubscriptions replaces all subscriptions for a client with new ones
	// This atomically removes old subscriptions and adds new ones
	ReplaceClientSubscriptions(clientID string, accountID string, newSubscriptions map[string][]string) error
}

// SyncClient interface defines what sync package needs from Client
type SyncClient interface {
	GetSyncInProgress() bool
	SetSyncInProgress(bool)
	GetSyncStartTime() time.Time
	SetSyncStartTime(time.Time)
	GetSyncMu() interface {
		Lock()
		Unlock()
	}
	GetAccountID() string
	GetSend() chan []byte
	LogContext() context.Context
}
