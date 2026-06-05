package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"
)

// startCleanupGoroutine starts a background goroutine that periodically cleans up idle queues
func (s *Server) startCleanupGoroutine() {
	go func() {
		ticker := time.NewTicker(config.CleanupInterval)
		defer ticker.Stop()

		for {
			select {
			case <-s.shutdownChan:
				return

			case <-ticker.C:
				s.cleanupIdleQueues()
			}
		}
	}()
}

// cleanupIdleQueues removes incoming queues that have been idle for longer than config.IdleQueueTimeout.
func (s *Server) cleanupIdleQueues() {
	ctx := context.Background()
	now := time.Now()
	cleanedIncoming := 0

	// Clean up incoming queues
	s.incomingMu.Lock()
	for docID, queue := range s.incomingQueues {
		// Check if queue is idle and empty
		idleTime := now.Sub(queue.lastUse)
		if idleTime > config.IdleQueueTimeout {
			// Try to lock to ensure no worker is processing
			if queue.mu.TryLock() {
				// Double-check queue is empty
				if len(queue.ch) == 0 {
					close(queue.ch)
					delete(s.incomingQueues, docID)
					cleanedIncoming++
					logs.DebugCtx(ctx, "cleaned idle incoming queue",
						"doc_id", docID,
						"idle_time", idleTime)
				}
				queue.mu.Unlock()
			}
		}
	}
	s.incomingMu.Unlock()

	// Clean up stale active subscriptions (older than config.ActiveSubscriptionTimeout)
	// This distinguishes between temporary disconnects and user logout
	// Also clean up subscriptions for clients that no longer exist
	cleanedActive := 0
	s.activeSubsMu.Lock()
	s.ClientsMu.RLock()
	existingClients := make(map[string]bool)
	for clientID := range s.Clients {
		existingClients[clientID] = true
	}
	s.ClientsMu.RUnlock()

	for clientID, activeDocs := range s.activeSubscriptions {
		// If client no longer exists, clean up all its subscriptions
		if !existingClients[clientID] {
			cleanedActive += len(activeDocs)
			delete(s.activeSubscriptions, clientID)
			logs.DebugCtx(ctx, "cleaned active subscriptions for disconnected client",
				"client_id", clientID,
				"doc_count", len(activeDocs))
			continue
		}

		// Clean up stale subscriptions (older than timeout)
		for docID, timestamp := range activeDocs {
			age := now.Sub(timestamp)
			if age > config.ActiveSubscriptionTimeout {
				delete(activeDocs, docID)
				cleanedActive++
				logs.DebugCtx(ctx, "cleaned stale active subscription (timeout)",
					"client_id", clientID,
					"doc_id", docID,
					"age", age)
			}
		}
		// Clean up empty client entry
		if len(activeDocs) == 0 {
			delete(s.activeSubscriptions, clientID)
		}
	}
	s.activeSubsMu.Unlock()

	if cleanedIncoming > 0 || cleanedActive > 0 {
		logs.DebugCtx(ctx, "cleanup completed",
			"incoming_queues_cleaned", cleanedIncoming,
			"active_subscriptions_cleaned", cleanedActive)
	}
}
