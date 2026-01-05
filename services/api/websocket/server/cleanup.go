package server

import (
	"eve-industry-planner/shared/shared/logs"
	"time"
)

// startCleanupGoroutine starts a background goroutine that periodically cleans up idle queues
func (s *Server) startCleanupGoroutine() {
	go func() {
		ticker := time.NewTicker(CleanupInterval)
		defer ticker.Stop()

		logs.Debug("cleanup goroutine started")
		defer logs.Debug("cleanup goroutine stopped")

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

// cleanupIdleQueues removes queues that have been idle for longer than IdleQueueTimeout
// and has no active subscribers (for outgoing queues).
func (s *Server) cleanupIdleQueues() {
	now := time.Now()
	cleanedIncoming := 0
	cleanedOutgoing := 0

	// Clean up incoming queues
	s.incomingMu.Lock()
	for docID, queue := range s.incomingQueues {
		// Check if queue is idle and empty
		idleTime := now.Sub(queue.lastUse)
		if idleTime > IdleQueueTimeout {
			// Try to lock to ensure no worker is processing
			if queue.mu.TryLock() {
				// Double-check queue is empty
				if len(queue.ch) == 0 {
					close(queue.ch)
					delete(s.incomingQueues, docID)
					cleanedIncoming++
					logs.Debug("cleaned idle incoming queue",
						"doc_id", docID,
						"idle_time", idleTime)
				}
				queue.mu.Unlock()
			}
		}
	}
	s.incomingMu.Unlock()

	// Clean up outgoing queues
	s.outgoingMu.Lock()
	for docID, queue := range s.outgoingQueues {
		// Check if queue is idle and has no subscribers
		idleTime := now.Sub(queue.lastUse)
		if idleTime > IdleQueueTimeout {
			// Try to lock to ensure no worker is processing
			if queue.mu.TryLock() {
				// Double-check queue is empty and no subscribers
				if len(queue.ch) == 0 && len(queue.subscribers) == 0 {
					close(queue.ch)
					delete(s.outgoingQueues, docID)
					cleanedOutgoing++
					logs.Debug("cleaned idle outgoing queue",
						"doc_id", docID,
						"idle_time", idleTime)
				}
				queue.mu.Unlock()
			}
		}
	}
	s.outgoingMu.Unlock()

	// Clean up stale active subscriptions (older than ActiveSubscriptionTimeout)
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
			logs.Debug("cleaned active subscriptions for disconnected client",
				"client_id", clientID,
				"doc_count", len(activeDocs))
			continue
		}

		// Clean up stale subscriptions (older than timeout)
		for docID, timestamp := range activeDocs {
			age := now.Sub(timestamp)
			if age > ActiveSubscriptionTimeout {
				delete(activeDocs, docID)
				cleanedActive++
				logs.Debug("cleaned stale active subscription (timeout)",
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

	if cleanedIncoming > 0 || cleanedOutgoing > 0 || cleanedActive > 0 {
		logs.Info("cleanup completed",
			"incoming_queues_cleaned", cleanedIncoming,
			"outgoing_queues_cleaned", cleanedOutgoing,
			"active_subscriptions_cleaned", cleanedActive)
	}
}
