package sync

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

// GetOrCreateSyncQueue gets or creates a sync queue for a client
// Thread-safe with SyncMu
func GetOrCreateSyncQueue(ctx context.Context, s SyncServer, clientID string) *SyncQueue {
	s.GetSyncMu().Lock()
	defer s.GetSyncMu().Unlock()

	queues := s.GetSyncQueues()
	queue, exists := queues[clientID]
	if !exists {
		queue = &SyncQueue{
			Ch:      make(chan SyncMessage, SyncQueueBufferSize),
			LastUse: time.Now(),
		}
		queues[clientID] = queue
		logs.DebugCtx(ctx, "created sync queue for client", "client_id", clientID)
	}

	queue.LastUse = time.Now()
	return queue
}

// EnqueueSyncMessage enqueues a sync message for a client
// Checks if client exists and if client is already syncing (skips if true)
func EnqueueSyncMessage(ctx context.Context, s SyncServer, clientID string, msg SyncMessage) error {
	// Verify client exists
	s.GetClientsMu().RLock()
	clients := s.GetClients()
	client, exists := clients[clientID]
	s.GetClientsMu().RUnlock()

	if !exists {
		logs.WarnCtx(ctx, "cannot enqueue sync message: client not found", "client_id", clientID)
		return nil // Not an error, client just disconnected
	}

	// Check if client is already syncing
	client.GetSyncMu().Lock()
	if client.GetSyncInProgress() {
		client.GetSyncMu().Unlock()
		logs.DebugCtx(ctx, "client already syncing, skipping sync message",
			"client_id", clientID,
			"sync_type", msg.Type)
		return nil // Skip if already syncing (one sync per client at a time)
	}
	client.GetSyncMu().Unlock()

	// Verify accountID matches client
	if msg.AccountID != client.GetAccountID() {
		logs.WarnCtx(ctx, "sync message accountID mismatch",
			"client_id", clientID,
			"message_account_id", msg.AccountID,
			"client_account_id", client.GetAccountID())
		return nil // Skip invalid message
	}

	// Get or create sync queue
	queue := GetOrCreateSyncQueue(ctx, s, clientID)

	// Enqueue message (non-blocking)
	select {
	case queue.Ch <- msg:
		queue.Mu.Lock()
		queue.LastUse = time.Now()
		queue.Mu.Unlock()

		// Signal coordinator that work is available
		signals := s.GetSyncSignals()
		select {
		case signals <- clientID:
			// Signal sent successfully
		default:
			// Signal channel full - coordinator will find work via scan anyway
			logs.DebugCtx(ctx, "sync signal channel full, will be picked up by scan",
				"client_id", clientID)
		}

		logs.InfoCtx(ctx, "sync message enqueued",
			"client_id", clientID,
			"account_id", msg.AccountID,
			"sync_type", msg.Type)

		return nil

	default:
		// Queue full - drop message
		logs.WarnCtx(ctx, "sync queue full, dropping message",
			"client_id", clientID,
			"sync_type", msg.Type)
		return nil // Not a critical error, just log it
	}
}
