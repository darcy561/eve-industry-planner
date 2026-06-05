package server

import "context"

func wsTargetExtra(client *Client, extra map[string]interface{}) map[string]interface{} {
	return wsLockTargetExtra(client, "", "", extra)
}

func finishWSOperationSuccess(
	ctx context.Context,
	client *Client,
	operation, msg string,
	extra map[string]interface{},
	successLevel string,
) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["operation"] = operation
	stepDetail := map[string]interface{}{
		"operation":  operation,
		"client_id":  client.id,
		"account_id": client.AccountID,
		"session_id": client.SessionID,
	}
	for k, v := range extra {
		stepDetail[k] = v
	}
	wsAppendDebugStep(ctx, "ws_operation_completed", stepDetail)
	wsEmitOperationOutcome(ctx, client, true, msg, wsTargetExtra(client, extra), successLevel)
}

func finishWSOperationFailure(
	ctx context.Context,
	client *Client,
	operation, msg, failureClass string,
	extra map[string]interface{},
) {
	if extra == nil {
		extra = map[string]interface{}{}
	}
	extra["operation"] = operation
	extra["failure_class"] = failureClass
	wsAppendDebugStep(ctx, "ws_operation_rejected", map[string]interface{}{
		"operation":     operation,
		"failure_class": failureClass,
		"client_id":     client.id,
		"account_id":    client.AccountID,
		"session_id":    client.SessionID,
	})
	wsEmitOperationOutcome(ctx, client, false, msg, wsTargetExtra(client, extra), "")
}
