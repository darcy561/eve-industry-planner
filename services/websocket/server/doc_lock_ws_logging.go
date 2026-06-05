package server

import (
	"context"
)

func wsLockTargetExtra(client *Client, collection, docID string, extra map[string]interface{}) map[string]interface{} {
	merged := map[string]interface{}{
		"transport": "websocket",
		"client_id": client.id,
	}
	if collection != "" {
		merged["collection"] = collection
	}
	if docID != "" {
		merged["doc_id"] = docID
	}
	if client.AccountID != "" {
		merged["account_id"] = client.AccountID
	}
	if client.SessionID != "" {
		merged["session_id"] = client.SessionID
	}
	for k, v := range extra {
		merged[k] = v
	}
	return merged
}

func wsAttachViewerPresenceStep(ctx context.Context, client *Client, event, collection, docID string) {
	wsAppendDebugStep(ctx, "viewer_presence_updated", wsLockTargetExtra(client, collection, docID, map[string]interface{}{
		"event": event,
	}))
}

func finishWSDocumentLockSuccess(
	ctx context.Context,
	client *Client,
	operation, msg, collection, docID string,
	extra map[string]interface{},
) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["operation"] = operation
	wsAppendDebugStep(ctx, "lock_operation_completed", map[string]interface{}{
		"operation":  operation,
		"client_id":  client.id,
		"collection": collection,
		"doc_id":     docID,
		"account_id": client.AccountID,
		"session_id": client.SessionID,
	})
	wsEmitOperationOutcome(ctx, client, true, msg, wsLockTargetExtra(client, collection, docID, extra), "")
}

func finishWSDocumentLockClientFailure(
	ctx context.Context,
	client *Client,
	operation, msg, failureClass, collection, docID string,
	extra map[string]interface{},
) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["operation"] = operation
	extra["failure_class"] = failureClass
	wsAppendDebugStep(ctx, "lock_operation_rejected", map[string]interface{}{
		"operation":     operation,
		"failure_class": failureClass,
		"client_id":     client.id,
		"account_id":    client.AccountID,
		"session_id":    client.SessionID,
	})
	wsEmitOperationOutcome(ctx, client, false, msg, wsLockTargetExtra(client, collection, docID, extra), "")
}

func finishWSLockStateBatchSuccess(ctx context.Context, client *Client, requestID string, jobDocCount, groupDocCount int, ackDelivered bool) {
	extra := map[string]interface{}{
		"operation":       "lock-state-batch",
		"request_id":      requestID,
		"job_doc_count":   jobDocCount,
		"group_doc_count": groupDocCount,
		"ack_delivered":   ackDelivered,
	}
	wsAppendDebugStep(ctx, "lock_operation_completed", map[string]interface{}{
		"operation":       "lock-state-batch",
		"request_id":      requestID,
		"client_id":       client.id,
		"job_doc_count":   jobDocCount,
		"group_doc_count": groupDocCount,
		"ack_delivered":   ackDelivered,
		"account_id":      client.AccountID,
		"session_id":      client.SessionID,
	})
	successLevel := "info"
	if !ackDelivered {
		successLevel = "" // caveat (ack buffer full) elevates to warn
	}
	wsEmitOperationOutcome(ctx, client, true, "document lock lock-state-batch", wsLockTargetExtra(client, "", "", extra), successLevel)
}

func finishWSLockStateBatchFailure(
	ctx context.Context,
	client *Client,
	requestID, msg, failureClass string,
	extra map[string]interface{},
) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["operation"] = "lock-state-batch"
	extra["failure_class"] = failureClass
	if requestID != "" {
		extra["request_id"] = requestID
	}
	wsAppendDebugStep(ctx, "lock_operation_rejected", map[string]interface{}{
		"operation":     "lock-state-batch",
		"failure_class": failureClass,
		"request_id":    requestID,
		"client_id":     client.id,
		"account_id":    client.AccountID,
		"session_id":    client.SessionID,
	})
	wsEmitOperationOutcome(ctx, client, false, msg, wsLockTargetExtra(client, "", "", extra), "")
}
