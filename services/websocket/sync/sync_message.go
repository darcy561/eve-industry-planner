package sync

import (
	"context"
	"encoding/json"
	"fmt"

	"eve-industry-planner/shared/logs"
)

// ClientSyncMessage represents a sync message from the client
// Format: {"type": "sync", "accountID": "...", "subscriptions": {"collection": ["id1", "id2"]}}
type ClientSyncMessage struct {
	Type          string              `json:"type"`          // "sync" (sync_drop removed)
	AccountID     string              `json:"accountID"`     // Account ID
	Subscriptions map[string][]string `json:"subscriptions"` // Grouped by collection
}

// ParseSyncMessage parses a sync message from client bytes
// Returns SyncMessage with ClientID filled in, or error if parsing fails
func ParseSyncMessage(ctx context.Context, clientID string, accountID string, msgBytes []byte) (*SyncMessage, error) {
	var clientMsg ClientSyncMessage
	if err := json.Unmarshal(msgBytes, &clientMsg); err != nil {
		return nil, fmt.Errorf("failed to parse sync message JSON: %w", err)
	}

	// Validate message type (only sync supported, sync_drop removed)
	if clientMsg.Type != "sync" {
		return nil, fmt.Errorf("invalid sync message type: %s (expected 'sync')", clientMsg.Type)
	}

	// Validate accountID is present
	if clientMsg.AccountID == "" {
		return nil, fmt.Errorf("accountID field is required")
	}

	// Validate accountID matches (security check)
	if clientMsg.AccountID != accountID {
		return nil, fmt.Errorf("accountID mismatch: expected %s, got %s", accountID, clientMsg.AccountID)
	}

	// Validate subscriptions is present (but allow empty - server will return account document)
	if clientMsg.Subscriptions == nil {
		return nil, fmt.Errorf("subscriptions field is required")
	}

	// Allow empty subscriptions - server will always return account document
	// No need to validate that subscriptions contain at least one document ID

	syncMsg := &SyncMessage{
		ClientID:      clientID,
		AccountID:     clientMsg.AccountID,
		Type:          clientMsg.Type,
		Subscriptions: clientMsg.Subscriptions,
	}

	logs.DebugCtx(ctx, "parsed sync message",
		"client_id", clientID,
		"account_id", clientMsg.AccountID,
		"type", clientMsg.Type,
		"collections", len(clientMsg.Subscriptions))

	return syncMsg, nil
}

// ServerSyncMessage represents messages sent from server to client during sync
type ServerSyncMessage struct {
	Type       string                 `json:"type"`                 // "sync_started", "sync_complete", "update", "delete"
	DocumentID string                 `json:"documentid,omitempty"` // Document ID (for update/delete)
	Collection string                 `json:"collection,omitempty"` // Collection name (for update/delete)
	Data       map[string]interface{} `json:"data,omitempty"`       // Document data (for update)
}

// FormatSyncStarted formats a sync_started message
func FormatSyncStarted() ([]byte, error) {
	msg := ServerSyncMessage{
		Type: "sync_started",
	}
	return json.Marshal(msg)
}

// FormatSyncComplete formats a sync_complete message
func FormatSyncComplete() ([]byte, error) {
	msg := ServerSyncMessage{
		Type: "sync_complete",
	}
	return json.Marshal(msg)
}

// FormatDocumentUpdate formats a document update message
func FormatDocumentUpdate(collection string, documentID string, data map[string]interface{}) ([]byte, error) {
	msg := ServerSyncMessage{
		Type:       "update",
		DocumentID: documentID,
		Collection: collection,
		Data:       data,
	}
	return json.Marshal(msg)
}

// FormatDocumentDelete formats a document delete notification
func FormatDocumentDelete(collection string, documentID string) ([]byte, error) {
	msg := ServerSyncMessage{
		Type:       "delete",
		DocumentID: documentID,
		Collection: collection,
	}
	return json.Marshal(msg)
}

// FormatSyncError formats an error message during sync
func FormatSyncError(errorMsg string) ([]byte, error) {
	msg := map[string]interface{}{
		"type":  "sync_error",
		"error": errorMsg,
	}
	return json.Marshal(msg)
}

// SyncDataCollection represents data for a single collection in sync_data message
type SyncDataCollection struct {
	Updates map[string]map[string]interface{} `json:"updates,omitempty"` // documentID -> document data
	Deletes []string                          `json:"deletes,omitempty"` // document IDs to delete
}

// SyncDataMessage represents the consolidated sync data message
// Format: {"type": "sync_data", "accountID": "...", "user": {...}, "collections": {"collectionName": {"updates": {...}, "deletes": [...]}}}
type SyncDataMessage struct {
	Type        string                        `json:"type"`                  // "sync_data"
	AccountID   string                        `json:"accountID"`             // Account ID
	User        map[string]interface{}        `json:"user,omitempty"`        // User account document (single document, not a collection)
	Collections map[string]SyncDataCollection `json:"collections,omitempty"` // collection -> {updates, deletes}
}

// FormatSyncData formats a consolidated sync data message
// This sends all sync data in a single message, split by collection and action type
// User document is sent separately as it's a single document per account, not a collection
func FormatSyncData(accountID string, userDoc map[string]interface{}, collections map[string]SyncDataCollection) ([]byte, error) {
	msg := SyncDataMessage{
		Type:        "sync_data",
		AccountID:   accountID,
		User:        userDoc,
		Collections: collections,
	}
	return json.Marshal(msg)
}

// HandleSyncMessage parses and enqueues a sync message, handling all error cases.
func HandleSyncMessage(ctx context.Context, s SyncServer, clientID string, accountID string, msgBytes []byte) {
	// Parse the sync message
	syncMsg, err := ParseSyncMessage(ctx, clientID, accountID, msgBytes)
	if err != nil {
		logs.WarnCtx(ctx, "failed to parse sync message",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
		return
	}

	if syncMsg == nil {
		logs.WarnCtx(ctx, "parsed sync message is nil",
			"client_id", clientID,
			"account_id", accountID)
		return
	}

	logs.DebugCtx(ctx, "sync message received",
		"client_id", clientID,
		"account_id", accountID,
		"sync_type", syncMsg.Type,
		"collections", len(syncMsg.Subscriptions),
		"message_account_id", syncMsg.AccountID)

	// Enqueue the sync message
	if err := EnqueueSyncMessage(ctx, s, clientID, *syncMsg); err != nil {
		logs.WarnCtx(ctx, "failed to enqueue sync message",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
	} else {
		logs.DebugCtx(ctx, "sync message enqueued successfully",
			"client_id", clientID,
			"account_id", accountID)
	}
}
