package sync

import (
	"context"
	"fmt"
	"time"

	"eve-industry-planner/shared/logs"
)

// ProcessSyncQueue processes sync messages for a client
// Uses context cancellation for timeout and disconnect handling
// Replaces all client subscriptions with new ones from sync message
func ProcessSyncQueue(s SyncServer, clientID string, timeout time.Duration) error {
	// Get client
	s.GetClientsMu().RLock()
	clients := s.GetClients()
	client, exists := clients[clientID]
	s.GetClientsMu().RUnlock()

	logCtx := context.Background()
	if exists {
		logCtx = client.LogContext()
	}

	if !exists {
		logs.DebugCtx(logCtx, "client not found, skipping sync", "client_id", clientID)
		return nil // Client disconnected
	}

	// Get sync queue
	s.GetSyncMu().Lock()
	queues := s.GetSyncQueues()
	queue, hasQueue := queues[clientID]
	s.GetSyncMu().Unlock()

	if !hasQueue {
		logs.DebugCtx(logCtx, "sync queue not found", "client_id", clientID)
		return nil
	}

	// Process messages from queue (non-blocking read)
	var msg SyncMessage
	select {
	case msg = <-queue.Ch:
		// Message received
	case <-time.After(100 * time.Millisecond):
		// No message available, queue might be empty
		return nil
	}

	// Check if client still exists
	s.GetClientsMu().RLock()
	clients = s.GetClients()
	client, exists = clients[clientID]
	s.GetClientsMu().RUnlock()

	if !exists {
		logs.DebugCtx(logCtx, "client disconnected before sync", "client_id", clientID)
		return nil // Client disconnected
	}

	// Only handle sync messages (sync_drop removed)
	if msg.Type != "sync" {
		logs.WarnCtx(logCtx, "invalid sync message type",
			"client_id", clientID,
			"type", msg.Type)
		return fmt.Errorf("invalid sync message type: %s (expected 'sync')", msg.Type)
	}

	// Mark client as syncing
	client.GetSyncMu().Lock()
	if client.GetSyncInProgress() {
		// Already syncing (shouldn't happen due to queue enforcement, but check anyway)
		client.GetSyncMu().Unlock()
		logs.DebugCtx(logCtx, "client already syncing, skipping", "client_id", clientID)
		return nil
	}
	client.SetSyncInProgress(true)
	client.SetSyncStartTime(time.Now())
	client.GetSyncMu().Unlock()

	// Defer cleanup of sync state
	defer func() {
		client.GetSyncMu().Lock()
		client.SetSyncInProgress(false)
		client.GetSyncMu().Unlock()
	}()

	// Create cancellable context with timeout
	baseCtx := client.LogContext()
	ctx, cancel := context.WithTimeout(baseCtx, timeout)
	defer cancel()

	// Start goroutine to monitor client disconnect
	// This will cancel the context if client disconnects
	monitorDone := make(chan struct{})
	go func() {
		defer close(monitorDone)
		ticker := time.NewTicker(200 * time.Millisecond) // Poll every 200ms
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				// Context cancelled (timeout or sync complete) - exit monitor
				return
			case <-ticker.C:
				// Check if client still exists
				s.GetClientsMu().RLock()
				clients := s.GetClients()
				_, exists := clients[clientID]
				s.GetClientsMu().RUnlock()

				if !exists {
					// Client disconnected - cancel context to stop all operations
					logs.DebugCtx(ctx, "client disconnected during sync, cancelling operations",
						"client_id", clientID)
					cancel()
					return
				}
			}
		}
	}()

	// Process sync message
	err := handleSyncMessage(ctx, s, client, clientID, msg)

	// Cancel context to signal monitor goroutine to exit
	cancel()

	// Wait for monitor goroutine to exit (with timeout)
	select {
	case <-monitorDone:
		// Monitor exited
	case <-time.After(500 * time.Millisecond):
		// Monitor didn't exit in time (shouldn't happen, but safe)
		logs.DebugCtx(context.Background(), "monitor goroutine didn't exit in time", "client_id", clientID)
	}

	return err
}

// handleSyncMessage processes a sync message
// Gathers initial data (jobs with displayOnPlanner=true, groups), merges with sync request subscriptions,
// and sends all data as a single consolidated message split by collection and action type
// All operations check context cancellation
func handleSyncMessage(ctx context.Context, s SyncServer, client SyncClient, clientID string, msg SyncMessage) error {
	accountID := client.GetAccountID()

	// Check context before starting
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Send sync_started message
	syncStarted, err := FormatSyncStarted()
	if err != nil {
		logs.ErrorCtx(ctx, "failed to format sync_started message",
			"client_id", clientID,
			"error", err)
		return err
	}

	select {
	case client.GetSend() <- syncStarted:
		// Message sent
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(1 * time.Second):
		logs.WarnCtx(ctx, "failed to send sync_started, client send buffer full",
			"client_id", clientID)
		return fmt.Errorf("client send buffer full")
	}

	logs.DebugCtx(ctx, "sync started",
		"client_id", clientID,
		"account_id", accountID,
		"collections", len(msg.Subscriptions))

	// Always fetch the account document first
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	accountDocs, err := QueryDocumentsByCollection(ctx, s, "users", []string{accountID}, accountID)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		logs.ErrorCtx(ctx, "failed to query account document during sync",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
		errorMsg, err := FormatSyncError("failed to query account document")
		if err == nil {
			select {
			case client.GetSend() <- errorMsg:
				logs.DebugCtx(ctx, "sent sync error for account document query failure",
					"client_id", clientID,
					"account_id", accountID)
			default:
			}
		}
		return fmt.Errorf("account document query failed: %w", err)
	}

	// Verify account document exists
	if _, found := accountDocs[accountID]; !found {
		logs.ErrorCtx(ctx, "account document not found during sync - critical error",
			"client_id", clientID,
			"account_id", accountID)

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		errorMsg, err := FormatSyncError("account document not found - user may not exist")
		if err != nil {
			logs.ErrorCtx(ctx, "failed to format sync error message",
				"client_id", clientID,
				"error", err)
			return fmt.Errorf("account document not found and failed to send error message")
		}

		select {
		case client.GetSend() <- errorMsg:
			logs.DebugCtx(ctx, "sent sync error for missing account document",
				"client_id", clientID,
				"account_id", accountID)
			return fmt.Errorf("account document not found for accountID: %s", accountID)
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(1 * time.Second):
			logs.ErrorCtx(ctx, "failed to send sync error, client send buffer full",
				"client_id", clientID)
			return fmt.Errorf("account document not found and failed to send error message")
		}
	}

	// Build consolidated sync data structure
	// Map: collection -> {updates: {docID -> data}, deletes: [docIDs]}
	syncData := make(map[string]SyncDataCollection)

	// Extract user document separately (single document per account, not a collection)
	var userDoc map[string]interface{}
	if accountDoc, found := accountDocs[accountID]; found {
		userDoc = accountDoc
	}

	// Gather initial data: jobs with displayOnPlanner=true
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	allJobs, err := QueryAllJobsForAccount(ctx, s, accountID)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		logs.ErrorCtx(ctx, "failed to query all jobs during sync",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
		// Continue - don't fail sync if jobs query fails
	} else {
		// Add jobs to sync data
		if len(allJobs) > 0 {
			syncData["jobs"] = SyncDataCollection{
				Updates: allJobs,
				Deletes: []string{},
			}
		}
	}

	// Gather initial data: all groups
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	allGroups, err := QueryAllGroupsForAccount(ctx, s, accountID)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		logs.ErrorCtx(ctx, "failed to query all groups during sync",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
		// Continue - don't fail sync if groups query fails
	} else {
		// Add groups to sync data
		if len(allGroups) > 0 {
			syncData["groups"] = SyncDataCollection{
				Updates: allGroups,
				Deletes: []string{},
			}
		}
	}

	// Merge with sync request subscriptions
	// For each collection in sync request, add additional document IDs to fetch
	// Note: "users" collection is handled separately and should not be in subscriptions
	for collectionName, requestedDocIDs := range msg.Subscriptions {
		// Check context cancellation
		select {
		case <-ctx.Done():
			logs.DebugCtx(ctx, "sync cancelled during processing",
				"client_id", clientID,
				"reason", ctx.Err())
			return ctx.Err()
		default:
		}

		// Skip users collection - it's handled separately
		if collectionName == "users" {
			logs.DebugCtx(ctx, "skipping users collection in subscriptions (handled separately)",
				"client_id", clientID)
			continue
		}

		// Get existing document IDs for this collection (from initial data)
		existingDocIDs := make(map[string]bool)
		if existing, ok := syncData[collectionName]; ok {
			for docID := range existing.Updates {
				existingDocIDs[docID] = true
			}
		}

		filteredDocIDs := requestedDocIDs

		// Find document IDs that are requested but not already in initial data
		additionalDocIDs := make([]string, 0)
		for _, docID := range filteredDocIDs {
			if !existingDocIDs[docID] {
				additionalDocIDs = append(additionalDocIDs, docID)
			}
		}

		// Query additional documents if any
		if len(additionalDocIDs) > 0 {
			documents, err := QueryDocumentsByCollection(ctx, s, collectionName, additionalDocIDs, accountID)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				logs.ErrorCtx(ctx, "failed to query additional documents during sync",
					"client_id", clientID,
					"collection", collectionName,
					"error", err)
				// Continue with other collections
			} else {
				// Merge additional documents into sync data
				if syncData[collectionName].Updates == nil {
					syncData[collectionName] = SyncDataCollection{
						Updates: make(map[string]map[string]interface{}),
						Deletes: []string{},
					}
				}
				collectionData := syncData[collectionName]
				for docID, docData := range documents {
					collectionData.Updates[docID] = docData
				}
				syncData[collectionName] = collectionData

				// Track missing documents for delete notifications
				for _, docID := range additionalDocIDs {
					if _, found := documents[docID]; !found {
						collectionData.Deletes = append(collectionData.Deletes, docID)
						syncData[collectionName] = collectionData
					}
				}
			}
		} else {
			// No additional documents, but check if any requested documents are missing
			// (they might have been in initial data but then deleted)
			if syncData[collectionName].Updates == nil {
				syncData[collectionName] = SyncDataCollection{
					Updates: make(map[string]map[string]interface{}),
					Deletes: []string{},
				}
			}
			collectionData := syncData[collectionName]
			for _, docID := range filteredDocIDs {
				if _, found := collectionData.Updates[docID]; !found {
					// Check if document exists in database
					documents, err := QueryDocumentsByCollection(ctx, s, collectionName, []string{docID}, accountID)
					if err == nil {
						if _, found := documents[docID]; !found {
							// Document doesn't exist - add to deletes
							collectionData.Deletes = append(collectionData.Deletes, docID)
							syncData[collectionName] = collectionData
						} else {
							// Document exists - add to updates
							collectionData.Updates[docID] = documents[docID]
							syncData[collectionName] = collectionData
						}
					}
				}
			}
		}
	}

	// Check context before sending consolidated message
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Send consolidated sync data message
	// User document is sent separately from collections
	syncDataMsg, err := FormatSyncData(accountID, userDoc, syncData)
	if err != nil {
		logs.ErrorCtx(ctx, "failed to format sync data message",
			"client_id", clientID,
			"error", err)
		return err
	}

	select {
	case client.GetSend() <- syncDataMsg:
		// Message sent
		logs.DebugCtx(ctx, "sync data sent",
			"client_id", clientID,
			"account_id", accountID,
			"collections", len(syncData),
			"has_user", userDoc != nil)
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(2 * time.Second):
		logs.WarnCtx(ctx, "failed to send sync data, client send buffer full",
			"client_id", clientID)
		return fmt.Errorf("client send buffer full")
	}

	// Check context before replacing subscriptions
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Replace client subscriptions with new ones from sync message
	if err := s.ReplaceClientSubscriptions(clientID, accountID, msg.Subscriptions); err != nil {
		logs.ErrorCtx(ctx, "failed to replace client subscriptions",
			"client_id", clientID,
			"account_id", accountID,
			"error", err)
		// Continue to send sync_complete even if subscription replacement failed
	}

	// Check context before sending sync_complete
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	// Send sync_complete message
	syncComplete, err := FormatSyncComplete()
	if err != nil {
		logs.ErrorCtx(ctx, "failed to format sync_complete message",
			"client_id", clientID,
			"error", err)
		return err
	}

	select {
	case client.GetSend() <- syncComplete:
		// Message sent
		logs.DebugCtx(ctx, "sync completed",
			"client_id", clientID,
			"account_id", accountID)
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(1 * time.Second):
		logs.WarnCtx(ctx, "failed to send sync_complete, client send buffer full",
			"client_id", clientID)
		return fmt.Errorf("client send buffer full")
	}
}
