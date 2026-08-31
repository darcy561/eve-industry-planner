package server

import (
	"context"
	"maps"
	"net/http"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"

	"go.uber.org/zap"
)

const wsUpgradeOperation = "websocket_upgrade"

func wsEmitOperationLog(ctx context.Context, client *Client, level, msg string, detail map[string]any, steps []logs.DebugStep, caveats []logs.HandlerCaveat) {
	if detail == nil {
		detail = map[string]any{}
	}
	if start, ok := logs.RequestStartTime(ctx); ok && !start.IsZero() {
		detail["duration_ms"] = time.Since(start).Milliseconds()
	}
	if messageID := wsMessageIDFromContext(ctx); messageID != "" {
		detail["message_id"] = messageID
	}

	fields := []zap.Field{logs.Ctx(ctx)}
	if client != nil {
		if client.AccountID != "" {
			fields = append(fields, zap.String("account_id", client.AccountID))
		}
		if client.SessionID != "" {
			fields = append(fields, zap.String("session_id", client.SessionID))
		}
	}
	fields = append(fields, logs.AccessLogDetailFields(detail)...)
	if len(steps) > 0 {
		fields = append(fields, zap.Any(logs.DebugStepsLogKey, logs.DebugStepsForLog(steps)))
	}
	if len(caveats) > 0 {
		fields = append(fields, zap.Any("caveats", logs.HandlerCaveatsForLog(caveats)))
	}

	logger := logs.FromContext(ctx)
	switch level {
	case "warn":
		logger.Warn(msg, fields...)
	case "error":
		logger.Error(msg, fields...)
	case "debug":
		logger.Debug(msg, fields...)
	default:
		logger.Info(msg, fields...)
	}
}

func wsEmitOperationOutcome(ctx context.Context, client *Client, success bool, msg string, detail map[string]any, successLevel string) {
	caveats := logs.HandlerCaveatsFromContext(ctx)
	level := "info"
	switch {
	case !success:
		level = "warn"
	case len(caveats) > 0:
		level = "warn"
	case successLevel != "":
		level = successLevel
	}
	steps := logs.DebugStepsFromContext(ctx)
	wsEmitOperationLog(ctx, client, level, msg, detail, steps, caveats)
}

func wsAppendDebugStep(ctx context.Context, step string, extra map[string]any) {
	logs.AttachDebugStepCtx(ctx, step, extra)
}

func wsTargetExtra(client *Client, extra map[string]any) map[string]any {
	return wsLockTargetExtra(client, "", "", extra)
}

func finishWSOperationSuccess(
	ctx context.Context,
	client *Client,
	operation, msg string,
	extra map[string]any,
	successLevel string,
) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["operation"] = operation
	stepDetail := map[string]any{
		"operation":  operation,
		"client_id":  client.id,
		"account_id": client.AccountID,
		"session_id": client.SessionID,
	}
	maps.Copy(stepDetail, extra)
	wsAppendDebugStep(ctx, "ws_operation_completed", stepDetail)
	wsEmitOperationOutcome(ctx, client, true, msg, wsTargetExtra(client, extra), successLevel)
}

func finishWSOperationFailure(
	ctx context.Context,
	client *Client,
	operation, msg, failureClass string,
	extra map[string]any,
) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["operation"] = operation
	extra["failure_class"] = failureClass
	wsAppendDebugStep(ctx, "ws_operation_rejected", map[string]any{
		"operation":     operation,
		"failure_class": failureClass,
		"client_id":     client.id,
		"account_id":    client.AccountID,
		"session_id":    client.SessionID,
	})
	wsEmitOperationOutcome(ctx, client, false, msg, wsTargetExtra(client, extra), "")
}

func wsUpgradeRejectClient(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	reasonCode string,
	status int,
	logMsg, responseBody, failureClass string,
	extra map[string]any,
) {
	duration := time.Since(start)
	s.recordUpgradeError(r.Context(), reasonCode, duration)
	detail := map[string]any{
		"operation":     wsUpgradeOperation,
		"failure_class": failureClass,
		"status_code":   status,
		"duration_ms":   duration.Milliseconds(),
	}
	if reasonCode != "" {
		detail["code"] = reasonCode
	}
	maps.Copy(detail, extra)
	stepExtra := map[string]any{
		"reason_code":   reasonCode,
		"failure_class": failureClass,
	}
	if reasonCode != "" {
		stepExtra["code"] = reasonCode
	}
	logs.AttachDebugStep(r, "websocket_upgrade_rejected", stepExtra)
	logs.AttachClientFailureDetail(r, logMsg, detail)
	if responseBody == "" {
		responseBody = logMsg
	}
	http.Error(w, responseBody, status)
}

func wsUpgradeRejectServer(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	reasonCode string,
	status int,
	logMsg, responseBody, failureClass string,
	err error,
	extra map[string]any,
) {
	duration := time.Since(start)
	s.recordUpgradeError(r.Context(), reasonCode, duration)
	detail := map[string]any{
		"operation":     wsUpgradeOperation,
		"failure_class": failureClass,
		"status_code":   status,
		"duration_ms":   duration.Milliseconds(),
	}
	if reasonCode != "" {
		detail["code"] = reasonCode
	}
	maps.Copy(detail, extra)
	logs.AttachDebugStep(r, "websocket_upgrade_rejected", map[string]any{
		"reason_code":   reasonCode,
		"failure_class": failureClass,
	})
	logs.AttachServerFailureDetail(r, logMsg, err, detail)
	if responseBody == "" {
		responseBody = logMsg
	}
	http.Error(w, responseBody, status)
}

func wsUpgradeAttachSessionValidated(r *http.Request, accountID, sessionID string) {
	logs.AttachDebugStep(r, "session_validated", map[string]any{
		"account_id": accountID,
		"session_id": sessionID,
	})
}

func wsUpgradeAttachConnectionLimitEviction(r *http.Request, accountID, evictedClientID string, connCount, maxConns int) {
	logs.AttachDebugStep(r, "connection_limit_evicted", map[string]any{
		"account_id":          accountID,
		"evicted_client_id":   evictedClientID,
		"current_connections": connCount,
		"max_connections":     maxConns,
	})
	logs.AttachHandlerCaveat(r, "connection_limit_eviction", "closed oldest connection to make room for new websocket", map[string]any{
		"evicted_client_id":   evictedClientID,
		"current_connections": connCount,
		"max_connections":     maxConns,
	})
}

func wsUpgradeAttachConnectionLimitFallback(r *http.Request, accountID string, connCount int) {
	logs.AttachHandlerCaveat(r, "connection_limit_fallback", "connection limit reached but no client could be evicted", map[string]any{
		"account_id":          accountID,
		"current_connections": connCount,
	})
}

func wsUpgradeFinishSuccess(
	r *http.Request,
	client *Client,
	characterHash string,
	totalClients, userConnections int,
	duration time.Duration,
	userAgent string,
) {
	logs.AttachDebugStep(r, "websocket_upgrade_completed", map[string]any{
		"client_id":        client.id,
		"account_id":       client.AccountID,
		"session_id":       client.SessionID,
		"total_clients":    totalClients,
		"user_connections": userConnections,
		"duration_ms":      duration.Milliseconds(),
	})
	logs.AttachHandlerSuccessDetail(r, "websocket client connected", map[string]any{
		"operation":        wsUpgradeOperation,
		"client_id":        client.id,
		"account_id":       client.AccountID,
		"session_id":       client.SessionID,
		"character_hash":   characterHash,
		"total_clients":    totalClients,
		"user_connections": userConnections,
		"duration_ms":      duration.Milliseconds(),
		"user_agent":       userAgent,
	})
}

func wsUpgradeRejectAuthSession(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	err error,
) {
	detail := apihelperauth.AuthSessionFailureDetailFromError(err, r)
	extra := detail.ClientFailureDetail(nil)
	failureClass, _ := extra["failure_class"].(string)
	wsUpgradeRejectClient(
		w, r, s, start,
		detail.Code,
		http.StatusUnauthorized,
		detail.ClientFailureMessage(),
		"Unauthorized: "+detail.Code,
		failureClass,
		extra,
	)
}

// finishReplicaFanoutOperation emits one consolidated NATS outcome log for fan-out on this
// websocket replica. Successful delivery logs at info with recipient account/session/client ids;
// idle replicas and no-recipient outcomes log at debug with an explicit message suffix.
func finishReplicaFanoutOperation(ctx context.Context, msg, docID, subject string, outcome outboundDeliveryOutcome, extra map[string]any) {
	detail := outboundDeliveryDetail(docID, subject, outcome)
	maps.Copy(detail, extra)
	level := "debug"
	logMsg := msg
	switch {
	case outcome.RecipientCount > 0:
		level = "info"
	case outcome.CandidateCount == 0:
		detail["replica_idle"] = true
		logMsg = msg + " (idle replica)"
	case outcome.hasSuppression():
		logMsg = msg + " (suppressed on replica)"
	default:
		logMsg = msg + " (no recipients on replica)"
	}
	eipnats.FinishNATSConsumerOperation(ctx, level, logMsg, detail)
}

func wsLockTargetExtra(client *Client, collection, docID string, extra map[string]any) map[string]any {
	merged := map[string]any{
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
	maps.Copy(merged, extra)
	return merged
}

func wsAttachViewerPresenceStep(ctx context.Context, client *Client, event, collection, docID string) {
	wsAppendDebugStep(ctx, "viewer_presence_updated", wsLockTargetExtra(client, collection, docID, map[string]any{
		"event": event,
	}))
}

func finishWSDocumentLockSuccess(
	ctx context.Context,
	client *Client,
	operation, msg, collection, docID string,
	extra map[string]any,
	successLevel string,
) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["operation"] = operation
	stepDetail := map[string]any{
		"operation":  operation,
		"client_id":  client.id,
		"account_id": client.AccountID,
		"session_id": client.SessionID,
	}
	if collection != "" {
		stepDetail["collection"] = collection
	}
	if docID != "" {
		stepDetail["doc_id"] = docID
	}
	maps.Copy(stepDetail, extra)
	wsAppendDebugStep(ctx, "lock_operation_completed", stepDetail)
	wsEmitOperationOutcome(ctx, client, true, msg, wsLockTargetExtra(client, collection, docID, extra), successLevel)
}

func finishWSDocumentLockClientFailure(
	ctx context.Context,
	client *Client,
	operation, msg, failureClass, collection, docID string,
	extra map[string]any,
) {
	if extra == nil {
		extra = map[string]any{}
	}
	extra["operation"] = operation
	extra["failure_class"] = failureClass
	stepDetail := map[string]any{
		"operation":     operation,
		"failure_class": failureClass,
		"client_id":     client.id,
		"account_id":    client.AccountID,
		"session_id":    client.SessionID,
	}
	if collection != "" {
		stepDetail["collection"] = collection
	}
	if docID != "" {
		stepDetail["doc_id"] = docID
	}
	maps.Copy(stepDetail, extra)
	wsAppendDebugStep(ctx, "lock_operation_rejected", stepDetail)
	wsEmitOperationOutcome(ctx, client, false, msg, wsLockTargetExtra(client, collection, docID, extra), "")
}

func finishWSLockStateBatchSuccess(ctx context.Context, client *Client, requestID string, jobDocCount, groupDocCount int, ackDelivered bool) {
	successLevel := "info"
	if !ackDelivered {
		successLevel = "" // caveat (ack buffer full) elevates to warn
	}
	finishWSDocumentLockSuccess(ctx, client, "lock-state-batch", "document lock lock-state-batch", "", "", map[string]any{
		"request_id":      requestID,
		"job_doc_count":   jobDocCount,
		"group_doc_count": groupDocCount,
		"ack_delivered":   ackDelivered,
	}, successLevel)
}

func finishWSLockStateBatchFailure(
	ctx context.Context,
	client *Client,
	requestID, msg, failureClass string,
	extra map[string]any,
) {
	if extra == nil {
		extra = map[string]any{}
	}
	if requestID != "" {
		extra["request_id"] = requestID
	}
	finishWSDocumentLockClientFailure(ctx, client, "lock-state-batch", msg, failureClass, "", "", extra)
}
