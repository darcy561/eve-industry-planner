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

// processIncomingBulkQueue processes bulk operations from the incoming bulk queue
func (s *Server) processIncomingBulkQueue() error {
	// Queue pointer is initialized once and never changes
	queue := s.incomingBulkQueue
	if queue == nil {
		return nil
	}

	// Try to acquire lock to prevent multiple workers from processing simultaneously
	if !queue.mu.TryLock() {
		return nil // Another worker is processing incoming bulk queue
	}
	defer queue.mu.Unlock()

	// Process one bulk operation array at a time (non-blocking)
	select {
	case operations := <-queue.ch:
		logs.Debug("processing bulk operation",
			"operation_count", len(operations))
		return s.processBulkOperations(operations)

	default:
		// No bulk operations ready
		return nil
	}
}

// processBulkOperations processes a batch of operations from bulk queue
func (s *Server) processBulkOperations(operations []Operation) error {
	if len(operations) == 0 {
		return nil
	}

	// Group operations by type
	var addOps []Operation
	var updateOps []Operation
	var deleteOps []Operation

	for _, op := range operations {
		switch op.Action {
		case "ADD":
			addOps = append(addOps, op)
		case "UPDATE":
			updateOps = append(updateOps, op)
		case "DELETE":
			deleteOps = append(deleteOps, op)
		default:
			logs.Warn("unknown action in bulk operation",
				"action", op.Action,
				"doc_id", op.DocumentID)
			// Treat as ADD by default
			addOps = append(addOps, op)
		}
	}

	// Get collection
	database := s.ServiceClients.Mongo.Database("eve_industry_planner")
	collection := database.Collection("users")

	// Process each type
	if len(addOps) > 0 {
		if err := s.processBulkAdds(collection, addOps); err != nil {
			logs.Error("bulk add failed", "error", err)
			// Continue processing other operations
		}
	}

	if len(updateOps) > 0 {
		// Process updates one by one (maintain order)
		for _, op := range updateOps {
			if err := s.processSingleUpdate(collection, op); err != nil {
				logs.Error("update failed",
					"doc_id", op.DocumentID,
					"error", err)
				// Continue processing other updates
			}
		}
	}

	if len(deleteOps) > 0 {
		if err := s.processBulkDeletes(collection, deleteOps); err != nil {
			logs.Error("bulk delete failed", "error", err)
			// Continue processing other operations
		}
	}

	logs.Debug("bulk operations processed",
		"total", len(operations),
		"adds", len(addOps),
		"updates", len(updateOps),
		"deletes", len(deleteOps))

	return nil
}

// processBulkAdds processes ADD operations using MongoDB BulkWrite
func (s *Server) processBulkAdds(collection *mongo.Collection, operations []Operation) error {
	if len(operations) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Build bulk write operations
	var bulkOps []mongo.WriteModel
	now := time.Now()

	for _, op := range operations {
		dbDoc := bson.M{
			"_id":       op.DocumentID,
			"docID":     op.DocumentID,
			"clientID":  op.ClientID,
			"updatedAt": now,
			"_meta": bson.M{
				"action":    "ADD",
				"source":    "websocket",
				"clientID":  op.ClientID,
				"timestamp": now.Unix(),
				"updatedAt": now,
			},
		}

		// Merge user data into document
		for k, v := range op.Data {
			dbDoc[k] = v
		}

		// Upsert (insert only, document shouldn't exist)
		bulkOps = append(bulkOps, mongo.NewUpdateOneModel().
			SetFilter(bson.M{"_id": op.DocumentID}).
			SetUpdate(bson.M{
				"$set": dbDoc,
				"$setOnInsert": bson.M{
					"version":   1,
					"createdAt": now,
				},
			}).
			SetUpsert(true))
	}

	// Execute bulk write with retry
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk add %d documents", len(operations))

	var result *mongo.BulkWriteResult
	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return err
	})
	if err != nil {
		return fmt.Errorf("bulk add failed: %w", err)
	}

	logs.Info("bulk add completed",
		"operations", len(operations),
		"inserted", result.InsertedCount,
		"upserted", result.UpsertedCount,
		"modified", result.ModifiedCount)

	// Broadcast updates for all added documents
	for _, op := range operations {
		s.broadcastDocumentUpdate(op.DocumentID, op)
	}

	return nil
}

// processSingleUpdate processes a single UPDATE operation (used by bulk processing)
func (s *Server) processSingleUpdate(collection *mongo.Collection, op Operation) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()
	dbDoc := bson.M{
		"_id":       op.DocumentID,
		"docID":     op.DocumentID,
		"clientID":  op.ClientID,
		"updatedAt": now,
		"_meta": bson.M{
			"action":    "UPDATE",
			"source":    "websocket",
			"clientID":  op.ClientID,
			"timestamp": now.Unix(),
			"updatedAt": now,
		},
	}

	// Merge user data into document
	for k, v := range op.Data {
		dbDoc[k] = v
	}

	// Single update (maintains ordering) with retry
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("update document %s", op.DocumentID)

	var result *mongo.UpdateResult
	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.UpdateOne(
			ctx,
			bson.M{"_id": op.DocumentID},
			bson.M{"$set": dbDoc},
			options.Update().SetUpsert(false),
		)
		return err
	})

	if err != nil {
		return fmt.Errorf("failed to update document: %w", err)
	}

	if result.MatchedCount == 0 {
		logs.Warn("update attempted on non-existent document",
			"doc_id", op.DocumentID)
		return fmt.Errorf("document not found: %s", op.DocumentID)
	}

	logs.Debug("document updated", "doc_id", op.DocumentID)
	s.broadcastDocumentUpdate(op.DocumentID, op)

	return nil
}

// processBulkDeletes processes DELETE operations using MongoDB BulkWrite
func (s *Server) processBulkDeletes(collection *mongo.Collection, operations []Operation) error {
	if len(operations) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()

	// First, add metadata to documents before deletion (for change streams) with retry
	for _, op := range operations {
		retryConfig := mongocore.DefaultRetryConfig()
		retryConfig.OperationName = fmt.Sprintf("add delete metadata for document %s", op.DocumentID)

		err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
			_, err := collection.UpdateOne(
				ctx,
				bson.M{"_id": op.DocumentID},
				bson.M{
					"$set": bson.M{
						"_meta": bson.M{
							"action":    "DELETE",
							"source":    "websocket",
							"clientID":  op.ClientID,
							"timestamp": now.Unix(),
							"updatedAt": now,
						},
					},
				},
			)
			return err
		})
		if err != nil {
			// Log but continue - document might not exist
			logs.Debug("failed to add metadata before delete",
				"doc_id", op.DocumentID,
				"error", err)
		}
	}

	// Build bulk delete operations
	var bulkOps []mongo.WriteModel
	for _, op := range operations {
		bulkOps = append(bulkOps, mongo.NewDeleteOneModel().
			SetFilter(bson.M{"_id": op.DocumentID}))
	}

	// Execute bulk delete with retry
	retryConfig := mongocore.DefaultRetryConfig()
	retryConfig.OperationName = fmt.Sprintf("bulk delete %d documents", len(operations))

	var result *mongo.BulkWriteResult
	err := mongocore.RetryMongoOperation(ctx, retryConfig, func() error {
		var err error
		result, err = collection.BulkWrite(ctx, bulkOps, options.BulkWrite().SetOrdered(false))
		return err
	})

	if err != nil {
		// Check if error is acceptable (e.g., some documents already deleted)
		if bulkErr, ok := err.(mongo.BulkWriteException); ok {
			for _, writeErr := range bulkErr.WriteErrors {
				logs.Warn("delete operation failed",
					"doc_id", operations[writeErr.Index].DocumentID,
					"error", writeErr)
			}
			// Continue - partial success is OK for deletes
		} else {
			return fmt.Errorf("bulk delete failed: %w", err)
		}
	}

	logs.Info("bulk delete completed",
		"operations", len(operations),
		"deleted", result.DeletedCount)

	return nil
}

// broadcastDocumentUpdate broadcasts a document update to subscribed clients
// Excludes the originating client (op.ClientID) from the broadcast
func (s *Server) broadcastDocumentUpdate(docID string, op Operation) {
	// Serialize operation to JSON for broadcasting
	// Include sourceClientID in message so broadcastToSubscribers can extract it
	updateData := map[string]interface{}{
		"documentid":     op.DocumentID,
		"action":         op.Action,
		"data":           op.Data,
		"sourceClientID": op.ClientID, // Include for filtering in broadcastToSubscribers
	}

	jsonData, err := json.Marshal(updateData)
	if err != nil {
		logs.Warn("failed to marshal update for broadcast",
			"doc_id", docID,
			"error", err)
		return
	}

	// Use existing broadcast function (extracts sourceClientID from message)
	s.broadcastToSubscribers(docID, jsonData)
}
