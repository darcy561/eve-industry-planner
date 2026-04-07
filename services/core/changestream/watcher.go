package changestream

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	mongocore "eve-industry-planner/shared/core/mongo"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"

	"github.com/nats-io/nats.go/jetstream"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const changestreamLogComponent = "changestream"

// ChangeStreamMessage represents the message payload sent to NATS
type ChangeStreamMessage struct {
	Subject        string                 `json:"subject"`
	Collection     string                 `json:"collection"`
	DocID          string                 `json:"docID"`
	OperationType  string                 `json:"operationType"`
	SourceClientID string                 `json:"sourceClientID,omitempty"` // ClientID that originated the change (for filtering)
	AccountID      string                 `json:"accountID,omitempty"`      // AccountID for INSERT operations (broadcast to all account clients)
	Document       map[string]interface{} `json:"document,omitempty"`
	ChangeEvent    map[string]interface{} `json:"changeEvent"`
}

// Watcher watches MongoDB change streams and publishes changes to NATS
type Watcher struct {
	mongoClient *mongo.Client
	jsContext   jetstream.JetStream
	database    *mongo.Database
	stopChan    chan struct{}
}

// NewWatcher creates a new change stream watcher
func NewWatcher(mongoClient *mongo.Client, jsContext jetstream.JetStream) *Watcher {
	return &Watcher{
		mongoClient: mongoClient,
		jsContext:   jsContext,
		database:    mongoClient.Database(mongocore.DatabaseName),
		stopChan:    make(chan struct{}),
	}
}

// Start begins watching MongoDB change streams
// Returns a stop function for graceful shutdown
func (w *Watcher) Start() func() {
	go w.watchChangeStreams()
	return func() {
		close(w.stopChan)
	}
}

// watchChangeStreams watches all collections in the database
func (w *Watcher) watchChangeStreams() {
	streamCtx := context.Background()
	logs.InfoCtx(streamCtx, "starting MongoDB change stream watcher",
		"component", changestreamLogComponent,
		"database", mongocore.DatabaseName)

	reconnectCount := 0
	for {
		select {
		case <-w.stopChan:
			logs.InfoCtx(streamCtx, "change stream watcher stopped",
				"component", changestreamLogComponent,
				"reconnects", reconnectCount)
			return
		default:
			// Watch at the database level to capture changes from all collections
			ctx, cancel := context.WithCancel(streamCtx)

			// Create change stream options
			// SetFullDocument: include full document for update/replace operations
			// SetFullDocumentBeforeChange: include document before deletion for DELETE operations
			opts := options.ChangeStream().
				SetFullDocument(options.UpdateLookup).
				SetFullDocumentBeforeChange(options.WhenAvailable)

			// Watch all collections in the database
			changeStream, err := w.database.Watch(ctx, mongo.Pipeline{}, opts)
			if err != nil {
				reconnectCount++
				logs.ErrorCtx(ctx, "failed to create change stream, will retry",
					"component", changestreamLogComponent,
					"error", err,
					"reconnect_attempt", reconnectCount)
				cancel()
				time.Sleep(5 * time.Second)
				continue
			}

			if reconnectCount > 0 {
				logs.InfoCtx(ctx, "change stream reconnected successfully",
					"component", changestreamLogComponent,
					"reconnect_count", reconnectCount)
				reconnectCount = 0 // Reset counter on successful connection
			} else {
				logs.DebugCtx(ctx, "change stream created, watching for changes",
					"component", changestreamLogComponent,
					"database", mongocore.DatabaseName)
			}

			// Process change events
			eventCount := 0
			for changeStream.Next(ctx) {
				eventCount++
				var changeEvent bson.M
				if err := changeStream.Decode(&changeEvent); err != nil {
					logs.WarnCtx(ctx, "failed to decode change event", "component", changestreamLogComponent, "error", err, "event_count", eventCount)
					continue
				}

				// Log received change event (before processing)
				if operationType, ok := changeEvent["operationType"].(string); ok {
					if ns, ok := changeEvent["ns"].(bson.M); ok {
						if collection, ok := ns["coll"].(string); ok {
							logs.DebugCtx(ctx, "change stream event received",
								"component", changestreamLogComponent,
								"operation", operationType,
								"collection", collection,
								"event_count", eventCount)
						}
					}
				}

				// Process the change event
				if err := w.processChangeEvent(ctx, changeEvent); err != nil {
					logs.WarnCtx(ctx, "failed to process change event", "component", changestreamLogComponent, "error", err, "event_count", eventCount)
					// Continue processing other events
				}
			}

			if eventCount > 0 {
				logs.InfoCtx(ctx, "change stream iteration completed", "component", changestreamLogComponent, "events_processed", eventCount)
			}

			// Check if change stream ended
			if err := changeStream.Err(); err != nil {
				logs.WarnCtx(ctx, "change stream error, will reconnect",
					"component", changestreamLogComponent,
					"error", err,
					"events_processed", eventCount)
				if err := changeStream.Close(ctx); err != nil {
					logs.WarnCtx(ctx, "error closing change stream", "component", changestreamLogComponent, "error", err)
				}
				cancel()
				// Wait before retrying
				time.Sleep(5 * time.Second)
				continue
			}

			// Close the change stream
			if err := changeStream.Close(ctx); err != nil {
				logs.WarnCtx(ctx, "error closing change stream", "component", changestreamLogComponent, "error", err)
			}
			cancel()
			logs.InfoCtx(ctx, "change stream closed, reconnecting...", "component", changestreamLogComponent, "events_processed", eventCount)
			time.Sleep(2 * time.Second)
		}
	}
}

// processChangeEvent processes a single change event and publishes it to NATS
func (w *Watcher) processChangeEvent(ctx context.Context, changeEvent bson.M) error {
	// Extract operation type
	operationType, ok := changeEvent["operationType"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid operationType")
	}

	// Extract namespace (database.collection)
	ns, ok := changeEvent["ns"].(bson.M)
	if !ok {
		return fmt.Errorf("missing namespace in change event")
	}

	collection, ok := ns["coll"].(string)
	if !ok {
		return fmt.Errorf("missing collection name in namespace")
	}

	// Extract document key (_id)
	documentKey, ok := changeEvent["documentKey"].(bson.M)
	if !ok {
		return fmt.Errorf("missing documentKey in change event")
	}

	docIDValue, ok := documentKey["_id"]
	if !ok {
		return fmt.Errorf("missing _id in documentKey")
	}

	// Convert docID to string
	var docID string
	switch v := docIDValue.(type) {
	case string:
		docID = v
	case int32, int64:
		docID = fmt.Sprintf("%d", v)
	case float64:
		docID = fmt.Sprintf("%.0f", v)
	default:
		docID = fmt.Sprintf("%v", v)
	}

	// Extract full document if available
	var document map[string]interface{}
	var sourceClientID string
	var accountID string

	// For DELETE operations, try to get fullDocumentBeforeChange
	// For other operations, use fullDocument
	var docToExtract bson.M
	if operationType == "delete" {
		if beforeDoc, ok := changeEvent["fullDocumentBeforeChange"].(bson.M); ok {
			docToExtract = beforeDoc
		}
	} else {
		if fullDoc, ok := changeEvent["fullDocument"].(bson.M); ok {
			docToExtract = fullDoc
		}
	}

	if docToExtract != nil {
		document = make(map[string]interface{})
		for k, v := range docToExtract {
			document[k] = v
		}

		// Extract sourceClientID from _meta.clientID (works for both jobs and users)
		if meta, ok := docToExtract["_meta"].(bson.M); ok {
			if clientID, ok := meta["clientID"].(string); ok && clientID != "" {
				sourceClientID = clientID
			}
		}

		// Extract accountID from document (for INSERT operations - broadcast to all account clients)
		if accID, ok := docToExtract["accountID"].(string); ok && accID != "" {
			accountID = accID
		}
	}

	// Convert change event to map for JSON serialization
	changeEventMap := make(map[string]interface{})
	for k, v := range changeEvent {
		changeEventMap[k] = v
	}

	// Create NATS subject: doc.update.{collection}.{docID}
	subject := fmt.Sprintf("%s.%s.%s", natscore.SubjectDocUpdate, collection, docID)

	// Create message payload
	message := ChangeStreamMessage{
		Subject:        subject,
		Collection:     collection,
		DocID:          docID,
		OperationType:  operationType,
		SourceClientID: sourceClientID,
		AccountID:      accountID,
		Document:       document,
		ChangeEvent:    changeEventMap,
	}

	// Marshal to JSON
	messageData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal change stream message: %w", err)
	}

	// Publish to NATS
	if err := natscore.PublishMessage(ctx, w.jsContext, subject, messageData); err != nil {
		logs.ErrorCtx(ctx, "failed to publish change stream message to NATS",
			"component", changestreamLogComponent,
			"operation", operationType,
			"collection", collection,
			"doc_id", docID,
			"subject", subject,
			"error", err)
		return fmt.Errorf("failed to publish change stream message: %w", err)
	}

	logs.InfoCtx(ctx, "change stream event published to NATS",
		"component", changestreamLogComponent,
		"operation", operationType,
		"collection", collection,
		"doc_id", docID,
		"subject", subject,
		"source_client_id", sourceClientID,
		"account_id", accountID,
		"has_document", document != nil)

	return nil
}

// StartService starts the MongoDB change stream watcher service.
// Returns a stop function for graceful shutdown.
func StartService(mongoSecondaryClient *mongo.Client, jsContext jetstream.JetStream) func() {
	watcher := NewWatcher(mongoSecondaryClient, jsContext)
	return watcher.Start()
}
