package server

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	"eve-industry-planner/shared/shared/logs"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// processIncomingQueue processes events from an incoming queue (client → database)
// This is executed by pond workers in the incoming pool
// Uses deduplication to reduce redundant database writes
func (s *Server) processIncomingQueue(docID string) error {
	// Get queue with read lock
	s.incomingMu.RLock()
	queue, exists := s.incomingQueues[docID]
	s.incomingMu.RUnlock()

	if !exists {
		return nil // Queue was deleted
	}

	// Try to acquire exclusive lock
	if !queue.mu.TryLock() {
		return nil // Another worker is processing this queue
	}
	defer queue.mu.Unlock()

	// 1. Drain all ready messages (non-blocking)
	messages := make([]Event, 0)
	for {
		select {
		case event := <-queue.ch:
			messages = append(messages, event)
		default:
			// No more ready messages
			goto drainComplete
		}
	}
drainComplete:

	// Update lastUse time
	queue.lastUse = time.Now()

	// If no messages, nothing to process
	if len(messages) == 0 {
		return nil
	}

	// 2. Handle subscribe messages separately (they don't need database writes)
	subscribeMessages := make([]Event, 0)
	unsubscribeMessages := make([]Event, 0)
	dbMessages := make([]Event, 0)
	for _, msg := range messages {
		if string(msg.Msg) == "subscribe" {
			subscribeMessages = append(subscribeMessages, msg)
		} else if string(msg.Msg) == "unsubscribe" {
			unsubscribeMessages = append(unsubscribeMessages, msg)
		} else {
			dbMessages = append(dbMessages, msg)
		}
	}

	// Process subscribe messages - ensure client is subscribed to document
	for _, subscribeMsg := range subscribeMessages {
		s.handleSubscribeRequest(subscribeMsg.ClientID, docID)
	}

	// Process unsubscribe messages - ensure client is unsubscribed from document
	for _, unsubscribeMsg := range unsubscribeMessages {
		s.handleUnsubscribeRequest(unsubscribeMsg.ClientID, docID)
	}

	// If only subscribe messages, we're done
	if len(dbMessages) == 0 {
		if len(subscribeMessages) > 0 {
			logs.Debug("processed subscribe requests",
				"doc_id", docID,
				"count", len(subscribeMessages))
		}
		return nil
	}

	// 3. Parse all database messages once (avoid parsing multiple times)
	parsed := s.parseAllMessages(dbMessages)

	// 4. Check for DELETE (terminal - discards all other messages)
	for i := range parsed {
		if parsed[i].valid && parsed[i].action == "DELETE" {
			// Found first DELETE - process it and discard all other messages
			if err := s.processParsedMessageToDatabase(parsed[i]); err != nil {
				logs.Error("failed to process delete event",
					"doc_id", docID,
					"client_id", parsed[i].clientID,
					"error", err)
				return err
			}

			logs.Info("processed delete event (terminal)",
				"doc_id", docID,
				"received", len(dbMessages),
				"discarded", len(dbMessages)-1)

			return nil
		}
	}

	// 5. Deduplicate messages (group by clientID, action) - uses already parsed data
	messagesToProcess := s.deduplicateParsedMessages(parsed)
	if len(messagesToProcess) == 0 {
		// All messages were invalid (couldn't parse)
		logs.Debug("all messages invalid, skipping",
			"doc_id", docID,
			"received", len(dbMessages))
		return nil
	}

	// 6. Process each deduplicated message (using already-parsed data)
	processed := 0
	for _, parsedMsg := range messagesToProcess {
		if err := s.processParsedMessageToDatabase(parsedMsg); err != nil {
			logs.Error("failed to process event to database",
				"doc_id", docID,
				"client_id", parsedMsg.clientID,
				"error", err)
			// Continue processing other events even if one fails
		} else {
			processed++
		}
	}

	// Log with deduplication metrics (INFO level for visibility)
	totalReceived := len(messages)
	if totalReceived > 1 {
		logs.Info("processed incoming queue",
			"doc_id", docID,
			"received", totalReceived,
			"subscribe_requests", len(subscribeMessages),
			"db_messages", len(dbMessages),
			"processed", processed,
			"deduplicated", len(dbMessages)-processed)
	} else {
		logs.Debug("processed incoming queue",
			"doc_id", docID,
			"received", totalReceived,
			"subscribe_requests", len(subscribeMessages),
			"db_messages", len(dbMessages),
			"processed", processed)
	}

	return nil
}

// processOutgoingQueue processes events from an outgoing queue (NATS → clients)
// This is executed by pond workers in the outgoing pool
func (s *Server) processOutgoingQueue(docID string) error {
	// Get queue with read lock
	s.outgoingMu.RLock()
	queue, exists := s.outgoingQueues[docID]
	s.outgoingMu.RUnlock()

	if !exists {
		return nil // Queue was deleted
	}

	// Try to acquire exclusive lock
	if !queue.mu.TryLock() {
		return nil // Another worker is processing this queue
	}
	defer queue.mu.Unlock()

	// Drain all ready messages (non-blocking)
	processed := 0
	for {
		select {
		case event := <-queue.ch:
			// Parse message once to extract all needed fields
			var msgData map[string]interface{}
			if err := json.Unmarshal(event.Msg, &msgData); err != nil {
				logs.Warn("failed to parse change stream message",
					"doc_id", docID,
					"error", err)
				queue.lastUse = time.Now()
				processed++
				continue
			}

			// Extract operation type
			operationType, _ := msgData["operationType"].(string)

			// Handle INSERT operations differently: broadcast to all account clients
			if operationType == "insert" {
				accountID, _ := msgData["accountID"].(string)
				if accountID != "" {
					// Broadcast to all account clients (function will extract sourceClientID from message)
					s.broadcastToAccountClients(docID, event.Msg)
					// Subscribe all clients to the document for future updates
					s.SubscribeClientToDocument(accountID, docID)
				} else {
					logs.Warn("INSERT message missing accountID",
						"doc_id", docID)
				}
			} else {
				// For UPDATE and DELETE: broadcast to subscribed clients only
				// Function will extract sourceClientID from message
				s.broadcastToSubscribers(docID, event.Msg)
			}
			queue.lastUse = time.Now()
			processed++

		default:
			// No more ready messages
			if processed > 0 {
				logs.Debug("processed outgoing queue",
					"doc_id", docID,
					"count", processed)
			}
			return nil
		}
	}
}

// deduplicateParsedMessages groups parsed messages by (clientID, action) sequentially
// Processes messages in order as they appear
// When clientID OR action changes, keeps latest from previous group and starts new group
// Returns list of parsed messages to process (one per group, latest message from each group)
// Only processes valid parsed messages - returns parsedMessage to avoid re-parsing
func (s *Server) deduplicateParsedMessages(parsed []parsedMessage) []parsedMessage {
	if len(parsed) == 0 {
		return nil
	}

	var currentGroup []parsedMessage
	var currentClientID string
	var currentAction string
	var result []parsedMessage

	for i := range parsed {
		// Skip invalid messages
		if !parsed[i].valid {
			continue
		}

		if parsed[i].clientID == currentClientID && parsed[i].action == currentAction {
			// Same group - add to group (collecting latest)
			currentGroup = append(currentGroup, parsed[i])
		} else {
			// Group changed (client OR action changed) - submit previous group
			if len(currentGroup) > 0 {
				// Add latest message from group (last one is most recent)
				result = append(result, currentGroup[len(currentGroup)-1])
			}
			// Start new group with new (clientID, action)
			currentGroup = []parsedMessage{parsed[i]}
			currentClientID = parsed[i].clientID
			currentAction = parsed[i].action
		}
	}

	// Process final group
	if len(currentGroup) > 0 {
		result = append(result, currentGroup[len(currentGroup)-1])
	}

	return result
}

// processParsedMessageToDatabase processes a parsed message to the database
// Uses already-parsed MessageFormat to avoid re-parsing JSON
func (s *Server) processParsedMessageToDatabase(parsed parsedMessage) error {
	if s.ServiceClients == nil || s.ServiceClients.Mongo == nil {
		logs.Warn("MongoDB not available, skipping database write",
			"doc_id", parsed.event.DocID)
		return nil
	}

	if !parsed.valid || parsed.msgFormat == nil {
		return fmt.Errorf("invalid parsed message")
	}

	msgFormat := parsed.msgFormat
	event := parsed.event

	// Extract document ID from message (convert to string if needed)
	docID := event.DocID // Fallback to reader-extracted docID
	if msgFormat.DocumentID != nil {
		switch v := msgFormat.DocumentID.(type) {
		case string:
			docID = v
		case float64:
			docID = fmt.Sprintf("%.0f", v) // Convert number to string
		case int:
			docID = fmt.Sprintf("%d", v)
		default:
			logs.Warn("unexpected documentid type, using reader-extracted docID",
				"documentid", msgFormat.DocumentID,
				"type", fmt.Sprintf("%T", msgFormat.DocumentID))
		}
	}

	// Get collection
	database := s.ServiceClients.Mongo.Database("eve_industry_planner")
	collection := database.Collection("users")

	// Route to appropriate handler based on action
	switch msgFormat.Action {
	case "ADD":
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	case "UPDATE":
		return s.handleUpdate(collection, docID, event.ClientID, msgFormat.Data)
	case "DELETE":
		return s.handleDelete(collection, docID, event.ClientID)
	default:
		logs.Warn("unknown action, defaulting to ADD",
			"doc_id", docID,
			"action", msgFormat.Action)
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	}
}

// processEventToDatabase processes a single event to the database
// Message format: { "documentid": "...", "action": "ADD|UPDATE|DELETE", "data": {...} }
// This is used when we need to process an Event that hasn't been parsed yet
func (s *Server) processEventToDatabase(event Event) error {
	if s.ServiceClients == nil || s.ServiceClients.Mongo == nil {
		logs.Warn("MongoDB not available, skipping database write",
			"doc_id", event.DocID)
		return nil
	}

	// Extract JSON part from message (format: "{docID} {jsonData}")
	// The docID is already extracted in the reader, so event.Msg contains the full message
	// including the docID prefix. We need to extract just the JSON part.
	messageData := event.Msg

	// If message starts with docID followed by space, extract JSON part
	docIDBytes := []byte(event.DocID)
	if len(messageData) > len(docIDBytes) && string(messageData[:len(docIDBytes)]) == event.DocID && messageData[len(docIDBytes)] == ' ' {
		messageData = messageData[len(docIDBytes)+1:]
		logs.Debug("extracted JSON from message",
			"doc_id", event.DocID,
			"json_length", len(messageData))
	}

	// Parse message as JSON
	var msgFormat MessageFormat
	if err := json.Unmarshal(messageData, &msgFormat); err != nil {
		previewLen := 200
		if len(messageData) < previewLen {
			previewLen = len(messageData)
		}
		logs.Warn("failed to parse message as JSON",
			"doc_id", event.DocID,
			"error", err,
			"message_preview", string(messageData[:previewLen]))
		return fmt.Errorf("failed to parse message: %w", err)
	}

	// Extract document ID from message (convert to string if needed)
	docID := event.DocID // Fallback to reader-extracted docID
	if msgFormat.DocumentID != nil {
		switch v := msgFormat.DocumentID.(type) {
		case string:
			docID = v
		case float64:
			docID = fmt.Sprintf("%.0f", v) // Convert number to string
		case int:
			docID = fmt.Sprintf("%d", v)
		default:
			logs.Warn("unexpected documentid type, using reader-extracted docID",
				"documentid", msgFormat.DocumentID,
				"type", fmt.Sprintf("%T", msgFormat.DocumentID))
		}
	}

	// Get collection
	database := s.ServiceClients.Mongo.Database("eve_industry_planner")
	collection := database.Collection("users")

	// Route to appropriate handler based on action
	switch msgFormat.Action {
	case "ADD":
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	case "UPDATE":
		return s.handleUpdate(collection, docID, event.ClientID, msgFormat.Data)
	case "DELETE":
		return s.handleDelete(collection, docID, event.ClientID)
	default:
		logs.Warn("unknown action, defaulting to ADD",
			"doc_id", docID,
			"action", msgFormat.Action)
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	}
}

// handleAdd creates a new document or updates if it exists (upsert)
func (s *Server) handleAdd(collection *mongo.Collection, docID, clientID string, data map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()

	// Build MongoDB document with metadata for change streams
	dbDoc := bson.M{
		"_id":       docID,
		"docID":     docID,
		"clientID":  clientID,
		"updatedAt": now,
		// Metadata for MongoDB change streams
		"_meta": bson.M{
			"action":    "ADD",
			"source":    "websocket",
			"clientID":  clientID,
			"timestamp": now.Unix(),
			"updatedAt": now,
		},
	}

	// Merge user data into document
	for k, v := range data {
		dbDoc[k] = v
	}

	// Upsert: Insert if not exists, update if exists
	opts := options.Update().SetUpsert(true)
	update := bson.M{
		"$set": dbDoc,
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
		},
	}

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("add document %s", docID)

	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		_, err := collection.UpdateOne(
			ctx,
			bson.M{"_id": docID},
			update,
			opts,
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to add document: %w", err)
	}
	logs.Debug("document added",
		"doc_id", docID)
	return nil
}

// handleUpdate updates an existing document (does not create if missing)
func (s *Server) handleUpdate(collection *mongo.Collection, docID, clientID string, data map[string]interface{}) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()

	// Build MongoDB document with metadata for change streams
	dbDoc := bson.M{
		"_id":       docID,
		"docID":     docID,
		"clientID":  clientID,
		"updatedAt": now,
		// Metadata for MongoDB change streams
		"_meta": bson.M{
			"action":    "UPDATE",
			"source":    "websocket",
			"clientID":  clientID,
			"timestamp": now.Unix(),
			"updatedAt": now,
		},
	}

	// Merge user data into document
	for k, v := range data {
		dbDoc[k] = v
	}

	// Update existing document or create if it doesn't exist (upsert)
	// This allows testing scenarios where UPDATE might be used on new documents
	update := bson.M{
		"$set": dbDoc,
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
		},
	}
	update["$set"].(bson.M)["updatedAt"] = time.Now()

	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("update document %s", docID)

	var result *mongo.UpdateResult
	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.UpdateOne(
			ctx,
			bson.M{"_id": docID},
			update,
			options.Update().SetUpsert(true), // Upsert: create if not exists
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to update document: %w", err)
	}
	// Note: In real-world scenarios, clients should only UPDATE documents they know exist
	// But for testing, upsert allows UPDATE to work on new documents
	if result.MatchedCount == 0 && result.UpsertedCount == 0 {
		logs.Warn("update attempted on non-existent document (unexpected)",
			"doc_id", docID)
		return fmt.Errorf("document not found: %s", docID)
	}
	logs.Debug("document updated",
		"doc_id", docID)
	return nil
}

// handleDelete deletes a document
// For DELETE operations, we add metadata via a final update before deletion
// so MongoDB change streams can capture the metadata
func (s *Server) handleDelete(collection *mongo.Collection, docID, clientID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()

	// First, add metadata to the document before deletion
	// This allows MongoDB change streams to capture the metadata in the delete event
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("add delete metadata for document %s", docID)

	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		_, err := collection.UpdateOne(
			ctx,
			bson.M{"_id": docID},
			bson.M{
				"$set": bson.M{
					"_meta": bson.M{
						"action":    "DELETE",
						"source":    "websocket",
						"clientID":  clientID,
						"timestamp": now.Unix(),
						"updatedAt": now,
					},
				},
			},
		)
		return err
	})
	if err != nil {
		logs.Warn("failed to add metadata before delete, proceeding with delete anyway",
			"doc_id", docID,
			"error", err)
	}

	// Now delete the document
	retryConfigDelete := mongocore.DefaultRetryConfig()
	retryConfigDelete.OperationName = fmt.Sprintf("delete document %s", docID)

	var result *mongo.DeleteResult
	err = mongocore.RetryMongoOperation(ctx, retryConfigDelete, func() error {
		var err error
		result, err = collection.DeleteOne(ctx, bson.M{"_id": docID})
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to delete document: %w", err)
	}
	if result.DeletedCount == 0 {
		logs.Warn("delete attempted on non-existent document",
			"doc_id", docID)
		return fmt.Errorf("document not found: %s", docID)
	}
	logs.Debug("document deleted",
		"doc_id", docID)
	return nil
}

// broadcastToAccountClients broadcasts a message to all clients of an accountID
// Used for INSERT operations - all clients of the account should receive the new document
// docID is the collection-scoped document ID (e.g., "users.account123" or "jobs.job456")
// Extracts accountID and sourceClientID from the message data
func (s *Server) broadcastToAccountClients(docID string, messageData []byte) {
	// Extract accountID and sourceClientID from message
	var msgData map[string]interface{}
	if err := json.Unmarshal(messageData, &msgData); err != nil {
		logs.Warn("failed to parse message for account broadcast",
			"doc_id", docID,
			"error", err)
		return
	}

	accountID, _ := msgData["accountID"].(string)
	if accountID == "" {
		logs.Warn("message missing accountID for account broadcast",
			"doc_id", docID)
		return
	}

	sourceClientID, _ := msgData["sourceClientID"].(string)

	s.userConnMu.RLock()
	clientIDs, hasConnections := s.userConnections[accountID]
	if !hasConnections {
		s.userConnMu.RUnlock()
		logs.Debug("no clients connected for account",
			"account_id", accountID)
		return
	}

	// Get copy of client IDs while holding read lock
	clientsToNotify := make([]string, 0, len(clientIDs))
	for clientID := range clientIDs {
		clientsToNotify = append(clientsToNotify, clientID)
	}
	s.userConnMu.RUnlock()

	// Broadcast to all account clients (without holding locks)
	broadcastCount := 0
	s.ClientsMu.RLock()
	for _, clientID := range clientsToNotify {
		// Skip the originating client (they already have the data)
		if sourceClientID != "" && clientID == sourceClientID {
			continue
		}

		client, exists := s.Clients[clientID]
		if !exists {
			// Client disconnected, skip
			continue
		}

		// Verify client belongs to this account (safety check)
		if client.AccountID != accountID {
			logs.Warn("client accountID mismatch",
				"client_id", clientID,
				"expected_account_id", accountID,
				"client_account_id", client.AccountID)
			continue
		}

		// Skip clients that are currently syncing (they'll get updates after sync completes)
		client.SyncMu.Lock()
		if client.SyncInProgress {
			client.SyncMu.Unlock()
			continue
		}
		client.SyncMu.Unlock()

		// Send message (non-blocking)
		select {
		case client.Send <- messageData:
			broadcastCount++
		default:
			logs.Warn("client send buffer full, dropping message",
				"client_id", clientID,
				"account_id", accountID)
		}
	}
	s.ClientsMu.RUnlock()

	if broadcastCount > 0 {
		logs.Debug("message broadcasted to account clients",
			"account_id", accountID,
			"doc_id", docID,
			"recipients", broadcastCount,
			"total_clients", len(clientsToNotify),
			"source_client_id", sourceClientID)
	}
}

// broadcastToSubscribers broadcasts a message to all clients subscribed to a document
// Extracts sourceClientID from the message data to exclude the originating client
func (s *Server) broadcastToSubscribers(docID string, messageData []byte) {
	// Extract sourceClientID from message
	var msgData map[string]interface{}
	sourceClientID := ""
	if err := json.Unmarshal(messageData, &msgData); err == nil {
		sourceClientID, _ = msgData["sourceClientID"].(string)
	}

	s.outgoingMu.RLock()
	queue, hasQueue := s.outgoingQueues[docID]
	if !hasQueue {
		s.outgoingMu.RUnlock()
		return
	}

	// Get copy of subscribers while holding read lock
	subscribers := make([]string, 0, len(queue.subscribers))
	for clientID := range queue.subscribers {
		subscribers = append(subscribers, clientID)
	}
	s.outgoingMu.RUnlock()

	// Broadcast to subscribers (without holding locks)
	broadcastCount := 0
	s.ClientsMu.RLock()
	for _, clientID := range subscribers {
		// Skip the originating client (they already have the data)
		if sourceClientID != "" && clientID == sourceClientID {
			continue
		}

		client, exists := s.Clients[clientID]
		if !exists {
			// Client disconnected, clean up subscription later
			continue
		}

		// Skip clients that are currently syncing (they'll get updates after sync completes)
		client.SyncMu.Lock()
		if client.SyncInProgress {
			client.SyncMu.Unlock()
			continue
		}
		client.SyncMu.Unlock()

		// Check if client is still subscribed to this document
		if !client.subscribedDocs[docID] {
			continue
		}

		// Send message (non-blocking)
		select {
		case client.Send <- messageData:
			broadcastCount++
		default:
			logs.Warn("client send buffer full, dropping message",
				"client_id", clientID,
				"doc_id", docID)
		}
	}
	s.ClientsMu.RUnlock()

	// Clean up stale subscriptions
	if broadcastCount < len(subscribers) {
		s.cleanupStaleSubscriptions(docID, subscribers)
	}

	if broadcastCount > 0 {
		logs.Debug("message broadcasted",
			"doc_id", docID,
			"recipients", broadcastCount)
	}
}

// cleanupStaleSubscriptions removes subscriptions for clients that no longer exist
func (s *Server) cleanupStaleSubscriptions(docID string, subscriberIDs []string) {
	s.outgoingMu.Lock()
	defer s.outgoingMu.Unlock()

	queue, exists := s.outgoingQueues[docID]
	if !exists {
		return
	}

	s.ClientsMu.RLock()
	for _, clientID := range subscriberIDs {
		if _, exists := s.Clients[clientID]; !exists {
			delete(queue.subscribers, clientID)
		}
	}
	s.ClientsMu.RUnlock()
}

// handleSubscribeRequest handles a subscribe request from a client
// This ensures the client is subscribed to receive updates for the document
func (s *Server) handleSubscribeRequest(clientID string, docID string) {
	// Get client to verify it exists and get accountID
	s.ClientsMu.Lock()
	client, exists := s.Clients[clientID]
	if !exists {
		s.ClientsMu.Unlock()
		logs.Debug("client not found for subscribe request",
			"client_id", clientID,
			"doc_id", docID)
		return
	}
	accountID := client.AccountID
	// Track subscription in client (while holding lock)
	client.subscribedDocs[docID] = true
	s.ClientsMu.Unlock()

	// Get or create outgoing queue for this document
	outQueue := s.getOrCreateOutgoingQueue(docID)

	// Subscribe client to outgoing queue
	outQueue.mu.Lock()
	outQueue.subscribers[clientID] = true
	outQueue.mu.Unlock()

	// Track as active subscription for this client (preserved across reconnects)
	s.activeSubsMu.Lock()
	if s.activeSubscriptions[clientID] == nil {
		s.activeSubscriptions[clientID] = make(map[string]time.Time)
	}
	s.activeSubscriptions[clientID][docID] = time.Now()
	s.activeSubsMu.Unlock()

	logs.Debug("processed subscribe request",
		"client_id", clientID,
		"account_id", accountID,
		"doc_id", docID)
}

// handleUnsubscribeRequest handles an unsubscribe request from a client
// This ensures the client is unsubscribed from receiving updates for the document
func (s *Server) handleUnsubscribeRequest(clientID string, docID string) {
	// Get client to verify it exists and get accountID
	s.ClientsMu.Lock()
	client, exists := s.Clients[clientID]
	if !exists {
		s.ClientsMu.Unlock()
		logs.Debug("client not found for unsubscribe request",
			"client_id", clientID,
			"doc_id", docID)
		return
	}
	accountID := client.AccountID
	// Track unsubscription in client (while holding lock)
	delete(client.subscribedDocs, docID)
	s.ClientsMu.Unlock()

	// Remove from outgoing queue (if it exists)
	s.outgoingMu.Lock()
	if queue, exists := s.outgoingQueues[docID]; exists {
		delete(queue.subscribers, clientID)
	}
	s.outgoingMu.Unlock()

	// Remove from active subscriptions (so it won't be restored on reconnect)
	s.activeSubsMu.Lock()
	if s.activeSubscriptions[clientID] != nil {
		delete(s.activeSubscriptions[clientID], docID)
		// Clean up empty client entry
		if len(s.activeSubscriptions[clientID]) == 0 {
			delete(s.activeSubscriptions, clientID)
		}
	}
	s.activeSubsMu.Unlock()

	logs.Debug("processed unsubscribe request",
		"client_id", clientID,
		"account_id", accountID,
		"doc_id", docID)
}
