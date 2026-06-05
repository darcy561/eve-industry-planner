package server

import (
	"context"

	syncpkg "eve-industry-planner/websocket/sync"

	"eve-industry-planner/shared/logs"
)

func (s *Server) handleSyncWS(ctx context.Context, client *Client, msg []byte) {
	syncMsg, err := syncpkg.ParseSyncMessage(ctx, client.id, client.AccountID, msg)
	if err != nil {
		finishWSOperationFailure(ctx, client, "sync",
			"websocket sync: invalid message",
			"ws_sync_invalid_message", map[string]interface{}{
				"error": err.Error(),
			})
		return
	}

	collectionCount := len(syncMsg.Subscriptions)
	docCount := syncSubscriptionDocCount(syncMsg.Subscriptions)
	wsAppendDebugStep(ctx, "sync_request", map[string]interface{}{
		"collection_count": collectionCount,
		"doc_count":        docCount,
	})

	outcome := syncpkg.EnqueueSyncMessageWithOutcome(ctx, s, client.id, *syncMsg)
	extra := map[string]interface{}{
		"collection_count": collectionCount,
		"doc_count":        docCount,
		"enqueue_status":   outcome.Status,
	}

	switch outcome.Status {
	case syncpkg.SyncEnqueueEnqueued:
		finishWSOperationSuccess(ctx, client, "sync", "websocket sync enqueued", extra, "info")
	case syncpkg.SyncEnqueueAlreadySyncing:
		logs.AttachHandlerCaveatCtx(ctx, "sync_already_in_progress",
			"client already syncing; message skipped", nil)
		finishWSOperationSuccess(ctx, client, "sync", "websocket sync skipped (already syncing)", extra, "")
	case syncpkg.SyncEnqueueClientNotFound:
		finishWSOperationFailure(ctx, client, "sync",
			"websocket sync: client disconnected",
			"ws_sync_client_not_found", extra)
	case syncpkg.SyncEnqueueAccountMismatch:
		finishWSOperationFailure(ctx, client, "sync",
			"websocket sync: account mismatch",
			"ws_sync_account_mismatch", extra)
	case syncpkg.SyncEnqueueQueueFull:
		finishWSOperationFailure(ctx, client, "sync",
			"websocket sync: queue full",
			"ws_sync_queue_full", extra)
	default:
		finishWSOperationFailure(ctx, client, "sync",
			"websocket sync: enqueue failed",
			"ws_sync_enqueue_failed", extra)
	}
}

func syncSubscriptionDocCount(subscriptions map[string][]string) int {
	if len(subscriptions) == 0 {
		return 0
	}
	n := 0
	for _, ids := range subscriptions {
		n += len(ids)
	}
	return n
}
