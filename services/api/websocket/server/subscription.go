package server

import (
	"fmt"
	"time"

	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
)

// SubscribeClientToDocument subscribes all active WebSocket connections for a given accountID
// to receive updates for a specific document. This is used by API endpoints to enable
// autosubscription when clients make HTTP requests with the AutoSubscribe header.
//
// Parameters:
//   - accountID: The account ID from JWT claims (identifies which user's connections to subscribe)
//   - docID: The document ID to subscribe to (e.g., "user.account123" or "job.456")
//
// This method:
//  1. Finds all active WebSocket connections for the accountID
//  2. Subscribes each connection to the document's outgoing queue
//  3. Tracks the subscription in each client's subscribedDocs map
//
// If no connections exist for the accountID, the subscription is still set up so that
// when the client connects later, they will be subscribed (if they send a message).
func (s *Server) SubscribeClientToDocument(accountID string, docID string) {
	if accountID == "" {
		logs.Warn("cannot subscribe: empty accountID", "doc_id", docID)
		return
	}
	if docID == "" {
		logs.Warn("cannot subscribe: empty docID", "account_id", accountID)
		return
	}

	// Get all client IDs for this account
	s.userConnMu.RLock()
	userConns, exists := s.userConnections[accountID]
	if !exists || len(userConns) == 0 {
		s.userConnMu.RUnlock()
		// No active connections - nothing to subscribe
		logs.Debug("no active connections to subscribe",
			"account_id", accountID,
			"doc_id", docID)
		return
	}

	// Copy client IDs to avoid holding lock while processing
	clientIDs := make([]string, 0, len(userConns))
	for clientID := range userConns {
		clientIDs = append(clientIDs, clientID)
	}
	s.userConnMu.RUnlock()

	// Get or create outgoing queue for this document
	outQueue := s.getOrCreateOutgoingQueue(docID)

	// Subscribe each client to the document
	s.ClientsMu.RLock()
	subscribedCount := 0
	for _, clientID := range clientIDs {
		client, exists := s.Clients[clientID]
		if !exists {
			// Client disconnected, skip
			continue
		}

		// Verify client belongs to this account (safety check)
		if client.AccountID != accountID {
			logs.Warn("client account mismatch during subscription",
				"client_id", clientID,
				"expected_account_id", accountID,
				"client_account_id", client.AccountID,
				"doc_id", docID)
			continue
		}

		// Add to outgoing queue subscribers
		outQueue.mu.Lock()
		outQueue.subscribers[clientID] = true
		outQueue.mu.Unlock()

		// Track subscription in client
		client.subscribedDocs[docID] = true

		// Track as active subscription for this client (preserved across reconnects)
		s.activeSubsMu.Lock()
		if s.activeSubscriptions[clientID] == nil {
			s.activeSubscriptions[clientID] = make(map[string]time.Time)
		}
		s.activeSubscriptions[clientID][docID] = time.Now()
		s.activeSubsMu.Unlock()

		subscribedCount++
	}
	s.ClientsMu.RUnlock()

	// Update metrics
	m := metrics.GetWebSocket()
	if subscribedCount > 0 {
		m.SubscriptionsActive.Add(float64(subscribedCount))

		// Update active subscriptions gauge
		s.activeSubsMu.RLock()
		totalActive := 0
		for _, subs := range s.activeSubscriptions {
			totalActive += len(subs)
		}
		s.activeSubsMu.RUnlock()
		m.ActiveSubscriptions.Set(float64(totalActive))
	}

	if subscribedCount > 0 {
		logs.Info("subscribed clients to document",
			"account_id", accountID,
			"doc_id", docID,
			"client_count", subscribedCount)
	} else {
		logs.Debug("no active clients to subscribe",
			"account_id", accountID,
			"doc_id", docID)
	}
}

// SubscribeClientToDocuments subscribes all active WebSocket connections for a given accountID
// to receive updates for multiple documents. This is useful for batch operations.
func (s *Server) SubscribeClientToDocuments(accountID string, docIDs []string) {
	logs.Info("subscribing client to multiple documents",
		"account_id", accountID,
		"doc_count", len(docIDs),
		"doc_ids", docIDs)
	for _, docID := range docIDs {
		s.SubscribeClientToDocument(accountID, docID)
	}
}

// SubscribeSingleClientToDocument subscribes only the first available client for a given accountID
// to receive updates for a specific document. This is used for autosubscription when we want
// to subscribe only the client making the request, not all clients for the account.
func (s *Server) SubscribeSingleClientToDocument(accountID string, docID string) {
	if accountID == "" {
		logs.Warn("cannot subscribe: empty accountID", "doc_id", docID)
		return
	}
	if docID == "" {
		logs.Warn("cannot subscribe: empty docID", "account_id", accountID)
		return
	}

	// Get first available client ID for this account
	s.userConnMu.RLock()
	userConns, exists := s.userConnections[accountID]
	if !exists || len(userConns) == 0 {
		s.userConnMu.RUnlock()
		// No active connections - nothing to subscribe
		logs.Debug("no active connections to subscribe",
			"account_id", accountID,
			"doc_id", docID)
		return
	}

	// Pick the first client ID
	var firstClientID string
	for clientID := range userConns {
		firstClientID = clientID
		break // Just get the first one
	}
	s.userConnMu.RUnlock()

	// Get client and verify it exists
	s.ClientsMu.RLock()
	client, exists := s.Clients[firstClientID]
	if !exists {
		s.ClientsMu.RUnlock()
		logs.Debug("client not found, skipping subscription",
			"client_id", firstClientID,
			"account_id", accountID,
			"doc_id", docID)
		return
	}

	// Verify client belongs to this account (safety check)
	if client.AccountID != accountID {
		s.ClientsMu.RUnlock()
		logs.Warn("client account mismatch during subscription",
			"client_id", firstClientID,
			"expected_account_id", accountID,
			"client_account_id", client.AccountID,
			"doc_id", docID)
		return
	}
	s.ClientsMu.RUnlock()

	// Get or create outgoing queue for this document
	outQueue := s.getOrCreateOutgoingQueue(docID)

	// Subscribe the client to the document
	outQueue.mu.Lock()
	outQueue.subscribers[firstClientID] = true
	outQueue.mu.Unlock()

	// Track subscription in client
	client.subscribedDocs[docID] = true

	// Track as active subscription for this client (preserved across reconnects)
	s.activeSubsMu.Lock()
	if s.activeSubscriptions[firstClientID] == nil {
		s.activeSubscriptions[firstClientID] = make(map[string]time.Time)
	}
	s.activeSubscriptions[firstClientID][docID] = time.Now()
	s.activeSubsMu.Unlock()

	logs.Info("subscribed single client to document",
		"client_id", firstClientID,
		"account_id", accountID,
		"doc_id", docID)
}

// cleanupClientSubscriptions removes a client's subscriptions from outgoing queues
// Subscriptions are preserved in activeSubscriptions for reconnection (they're tracked per client)
func (s *Server) cleanupClientSubscriptions(clientID string, accountID string, subscribedDocs map[string]bool) {
	if len(subscribedDocs) == 0 {
		return
	}

	// Clean up subscriptions from outgoing queues
	cleanedCount := 0
	s.outgoingMu.Lock()
	for docID := range subscribedDocs {
		if queue, exists := s.outgoingQueues[docID]; exists {
			queue.mu.Lock()
			if _, wasSubscribed := queue.subscribers[clientID]; wasSubscribed {
				delete(queue.subscribers, clientID)
				cleanedCount++
			}
			queue.mu.Unlock()
		}
	}
	s.outgoingMu.Unlock()

	// Subscriptions are preserved in activeSubscriptions (tracked per account, not per client)
	// They will be restored when the client reconnects
	if cleanedCount > 0 {
		logs.Debug("cleaned up client subscriptions from outgoing queues",
			"account_id", accountID,
			"client_id", clientID,
			"doc_count", cleanedCount,
			"doc_ids", getDocIDKeys(subscribedDocs))
	}
}

// ReplaceClientSubscriptions replaces all subscriptions for a client with new ones
// This atomically removes old subscriptions and adds new ones
// Used during sync to replace client's subscription state with server's view
func (s *Server) ReplaceClientSubscriptions(clientID string, accountID string, newSubscriptions map[string][]string) error {
	// Get client
	s.ClientsMu.RLock()
	client, exists := s.Clients[clientID]
	s.ClientsMu.RUnlock()

	if !exists {
		return fmt.Errorf("client not found: %s", clientID)
	}

	// Verify client belongs to this account (safety check)
	if client.AccountID != accountID {
		return fmt.Errorf("client account mismatch: expected %s, got %s", accountID, client.AccountID)
	}

	// Get current subscriptions from client
	oldSubscriptions := make(map[string]bool)
	for docID := range client.subscribedDocs {
		oldSubscriptions[docID] = true
	}

	// Remove old subscriptions from outgoing queues
	removedCount := 0
	s.outgoingMu.Lock()
	for docID := range oldSubscriptions {
		if queue, exists := s.outgoingQueues[docID]; exists {
			queue.mu.Lock()
			if _, wasSubscribed := queue.subscribers[clientID]; wasSubscribed {
				delete(queue.subscribers, clientID)
				removedCount++
			}
			queue.mu.Unlock()
		}
	}
	s.outgoingMu.Unlock()

	// Clear client's subscribedDocs
	client.subscribedDocs = make(map[string]bool)

	// Add new subscriptions
	// Construct collection-scoped docIDs (e.g., "users.account123")
	newDocIDs := make([]string, 0)
	for collectionName, documentIDs := range newSubscriptions {
		for _, docID := range documentIDs {
			collectionScopedDocID := fmt.Sprintf("%s.%s", collectionName, docID)
			newDocIDs = append(newDocIDs, collectionScopedDocID)

			// Get or create outgoing queue for this document
			outQueue := s.getOrCreateOutgoingQueue(collectionScopedDocID)

			// Add to outgoing queue subscribers
			outQueue.mu.Lock()
			outQueue.subscribers[clientID] = true
			outQueue.mu.Unlock()

			// Track subscription in client
			client.subscribedDocs[collectionScopedDocID] = true
		}
	}

	// Update active subscriptions for this client (preserved across reconnects)
	s.activeSubsMu.Lock()
	if s.activeSubscriptions[clientID] == nil {
		s.activeSubscriptions[clientID] = make(map[string]time.Time)
	}

	// Remove old subscriptions that are no longer in the new set
	oldDocIDSet := make(map[string]bool)
	for docID := range oldSubscriptions {
		oldDocIDSet[docID] = true
	}

	// Create set of new docIDs for quick lookup
	newDocIDSet := make(map[string]bool)
	for _, docID := range newDocIDs {
		newDocIDSet[docID] = true
	}

	// Remove old subscriptions that are no longer in the new set
	for docID := range s.activeSubscriptions[clientID] {
		if !newDocIDSet[docID] {
			delete(s.activeSubscriptions[clientID], docID)
		}
	}

	// Update timestamps for new subscriptions
	for _, docID := range newDocIDs {
		s.activeSubscriptions[clientID][docID] = time.Now()
	}

	// Clean up empty client entry
	if len(s.activeSubscriptions[clientID]) == 0 {
		delete(s.activeSubscriptions, clientID)
	}

	s.activeSubsMu.Unlock()

	logs.Info("replaced client subscriptions",
		"client_id", clientID,
		"account_id", accountID,
		"removed_count", removedCount,
		"added_count", len(newDocIDs))

	return nil
}

// getDocIDKeys extracts keys from a map for logging
func getDocIDKeys(docMap map[string]bool) []string {
	keys := make([]string, 0, len(docMap))
	for k := range docMap {
		keys = append(keys, k)
	}
	return keys
}
