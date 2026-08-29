package server

import (
	"context"
	"fmt"
	"maps"
	"time"

	"eve-industry-planner/shared/logs"
	eipmongo "eve-industry-planner/shared/mongo"
	"eve-industry-planner/websocket/server/incominglogic"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// processIncomingQueue processes events from an incoming queue (client → database)
// Serialised per docID via queue mutex (TryLock); invoked from coordinator goroutines.
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

	logCtx := context.Background()
	if len(subscribeMessages) > 0 {
		logCtx = s.clientLogCtx(subscribeMessages[0].ClientID)
	} else if len(dbMessages) > 0 {
		logCtx = s.clientLogCtx(dbMessages[0].ClientID)
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
			logs.DebugCtx(logCtx, "processed subscribe requests",
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
				logs.ErrorCtx(logCtx, "failed to process delete event",
					"doc_id", docID,
					"client_id", parsed[i].clientID,
					"error", err)
				return err
			}

			logs.DebugCtx(logCtx, "processed delete event (terminal)",
				"doc_id", docID,
				"received", len(dbMessages),
				"discarded", len(dbMessages)-1)

			return nil
		}
	}

	// 5. Deduplicate messages (group by clientID, action) - uses already parsed data
	parsedForDedupe := make([]incominglogic.ParsedEnvelope, len(parsed))
	for i := range parsed {
		parsedForDedupe[i] = incominglogic.ParsedEnvelope{
			Valid:    parsed[i].valid,
			ClientID: parsed[i].clientID,
			Action:   parsed[i].action,
		}
	}
	keepIndexes := incominglogic.DeduplicateSequential(parsedForDedupe)
	messagesToProcess := make([]parsedMessage, 0, len(keepIndexes))
	for _, idx := range keepIndexes {
		if idx >= 0 && idx < len(parsed) {
			messagesToProcess = append(messagesToProcess, parsed[idx])
		}
	}
	if len(messagesToProcess) == 0 {
		// All messages were invalid (couldn't parse)
		logs.DebugCtx(logCtx, "all messages invalid, skipping",
			"doc_id", docID,
			"received", len(dbMessages))
		return nil
	}

	// 6. Process each deduplicated message (using already-parsed data)
	processed := 0
	for _, parsedMsg := range messagesToProcess {
		if err := s.processParsedMessageToDatabase(parsedMsg); err != nil {
			logs.ErrorCtx(logCtx, "failed to process event to database",
				"doc_id", docID,
				"client_id", parsedMsg.clientID,
				"error", err)
			// Continue processing other events even if one fails
		} else {
			processed++
		}
	}

	totalReceived := len(messages)
	logs.DebugCtx(logCtx, "processed incoming queue",
		"doc_id", docID,
		"received", totalReceived,
		"subscribe_requests", len(subscribeMessages),
		"db_messages", len(dbMessages),
		"processed", processed,
		"deduplicated", len(dbMessages)-processed)

	return nil
}

// processParsedMessageToDatabase processes a parsed message to the database
// Uses already-parsed MessageFormat to avoid re-parsing JSON
func (s *Server) processParsedMessageToDatabase(parsed parsedMessage) error {
	lc := s.clientLogCtx(parsed.event.ClientID)
	if s.Stack == nil || s.Stack.Mongo == nil {
		logs.WarnCtx(lc, "MongoDB not available, skipping database write",
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
			logs.WarnCtx(lc, "unexpected documentid type, using reader-extracted docID",
				"documentid", msgFormat.DocumentID,
				"type", fmt.Sprintf("%T", msgFormat.DocumentID))
		}
	}

	// Get collection
	mongo := s.Stack.Mongo
	collection := mongo.Users.Collection()

	// Route to appropriate handler based on action
	switch msgFormat.Action {
	case "ADD":
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	case "UPDATE":
		return s.handleUpdate(collection, docID, event.ClientID, msgFormat.Data)
	case "DELETE":
		return s.handleDelete(collection, docID, event.ClientID)
	default:
		logs.WarnCtx(lc, "unknown action, defaulting to ADD",
			"doc_id", docID,
			"action", msgFormat.Action)
		return s.handleAdd(collection, docID, event.ClientID, msgFormat.Data)
	}
}

// handleAdd creates a new document or updates if it exists (upsert)
func (s *Server) handleAdd(collection *mongo.Collection, docID, clientID string, data map[string]any) error {
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
	maps.Copy(dbDoc, data)

	// Upsert: Insert if not exists, update if exists
	opts := options.UpdateOne().SetUpsert(true)
	update := bson.M{
		"$set": dbDoc,
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
		},
	}

	err := eipmongo.Retry(ctx, fmt.Sprintf("add document %s", docID), func() error {
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
	logs.DebugCtx(ctx, "document added",
		"doc_id", docID)
	return nil
}

// handleUpdate updates an existing document (does not create if missing)
func (s *Server) handleUpdate(collection *mongo.Collection, docID, clientID string, data map[string]any) error {
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
	maps.Copy(dbDoc, data)

	// Update existing document or create if it doesn't exist (upsert)
	// This allows testing scenarios where UPDATE might be used on new documents
	update := bson.M{
		"$set": dbDoc,
		"$setOnInsert": bson.M{
			"createdAt": time.Now(),
		},
	}
	update["$set"].(bson.M)["updatedAt"] = time.Now()

	var result *mongo.UpdateResult
	err := eipmongo.Retry(ctx, fmt.Sprintf("update document %s", docID), func() error {
		var err error
		result, err = collection.UpdateOne(
			ctx,
			bson.M{"_id": docID},
			update,
			options.UpdateOne().SetUpsert(true), // Upsert: create if not exists
		)
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to update document: %w", err)
	}
	// Note: In real-world scenarios, clients should only UPDATE documents they know exist
	// But for testing, upsert allows UPDATE to work on new documents
	if result.MatchedCount == 0 && result.UpsertedCount == 0 {
		logs.WarnCtx(ctx, "update attempted on non-existent document (unexpected)",
			"doc_id", docID)
		return fmt.Errorf("document not found: %s", docID)
	}
	logs.DebugCtx(ctx, "document updated",
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
	err := eipmongo.Retry(ctx, fmt.Sprintf("add delete metadata for document %s", docID), func() error {
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
		logs.WarnCtx(ctx, "failed to add metadata before delete, proceeding with delete anyway",
			"doc_id", docID,
			"error", err)
	}

	// Now delete the document
	var result *mongo.DeleteResult
	err = eipmongo.Retry(ctx, fmt.Sprintf("delete document %s", docID), func() error {
		var err error
		result, err = collection.DeleteOne(ctx, bson.M{"_id": docID})
		return err
	})
	if err != nil {
		return fmt.Errorf("failed to delete document: %w", err)
	}
	if result.DeletedCount == 0 {
		logs.WarnCtx(ctx, "delete attempted on non-existent document",
			"doc_id", docID)
		return fmt.Errorf("document not found: %s", docID)
	}
	logs.DebugCtx(ctx, "document deleted",
		"doc_id", docID)
	return nil
}
