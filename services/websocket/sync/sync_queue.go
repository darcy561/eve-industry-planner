package sync

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

const (
	SyncEnqueueEnqueued        = "enqueued"
	SyncEnqueueClientNotFound  = "client_not_found"
	SyncEnqueueAlreadySyncing  = "already_syncing"
	SyncEnqueueAccountMismatch = "account_mismatch"
	SyncEnqueueQueueFull       = "queue_full"
)

// SyncEnqueueOutcome describes how a client sync message was accepted.
type SyncEnqueueOutcome struct {
	Status string
}

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

// EnqueueSyncMessageWithOutcome enqueues a sync message for a client and reports the result
// for consolidated websocket logging.
func EnqueueSyncMessageWithOutcome(ctx context.Context, s SyncServer, clientID string, msg SyncMessage) SyncEnqueueOutcome {
	s.GetClientsMu().RLock()
	clients := s.GetClients()
	client, exists := clients[clientID]
	s.GetClientsMu().RUnlock()

	if !exists {
		return SyncEnqueueOutcome{Status: SyncEnqueueClientNotFound}
	}

	client.GetSyncMu().Lock()
	if client.GetSyncInProgress() {
		client.GetSyncMu().Unlock()
		return SyncEnqueueOutcome{Status: SyncEnqueueAlreadySyncing}
	}
	client.GetSyncMu().Unlock()

	if msg.AccountID != client.GetAccountID() {
		return SyncEnqueueOutcome{Status: SyncEnqueueAccountMismatch}
	}

	queue := GetOrCreateSyncQueue(ctx, s, clientID)

	select {
	case queue.Ch <- msg:
		queue.Mu.Lock()
		queue.LastUse = time.Now()
		queue.Mu.Unlock()

		signals := s.GetSyncSignals()
		select {
		case signals <- clientID:
		default:
		}
		return SyncEnqueueOutcome{Status: SyncEnqueueEnqueued}

	default:
		logs.WarnCtx(ctx, "sync queue full, dropping message",
			"client_id", clientID,
			"sync_type", msg.Type)
		return SyncEnqueueOutcome{Status: SyncEnqueueQueueFull}
	}
}

// EnqueueSyncMessage enqueues a sync message for a client.
func EnqueueSyncMessage(ctx context.Context, s SyncServer, clientID string, msg SyncMessage) error {
	_ = EnqueueSyncMessageWithOutcome(ctx, s, clientID, msg)
	return nil
}
