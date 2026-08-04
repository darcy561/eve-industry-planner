package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/doclocklogic"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type wsMessageIDKey struct{}

const wsTracerName = "eve-industry-planner/websocket"

var wsTracer = otel.Tracer(wsTracerName)

func wsMessageIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(wsMessageIDKey{}).(string)
	return v
}

func isConsolidatedWSOperationMessageType(msgType string) bool {
	switch msgType {
	case "session_resume",
		"sync",
		"subscribe",
		"unsubscribe",
		"upgrade_scopes",
		doclocklogic.MsgLockStateBatch,
		doclocklogic.MsgWaitlistPulse,
		doclocklogic.MsgViewerArrived,
		doclocklogic.MsgViewerDeparted:
		return true
	default:
		return false
	}
}

func shouldSkipReaderPerMessageDebug(msg []byte, consolidatedMsgType string) bool {
	if isConsolidatedWSOperationMessageType(consolidatedMsgType) {
		return true
	}
	return len(msg) == 4 && string(msg) == "ping"
}

func beginWSMessageOperation(client *Client, messageType string, msg []byte) (context.Context, func()) {
	parent := client.LogContext()
	ctx := logs.BeginIsolatedOperationContext(parent)

	messageID := uuid.NewString()
	ctx = context.WithValue(ctx, wsMessageIDKey{}, messageID)

	attrs := []attribute.KeyValue{
		attribute.String("ws.message_type", messageType),
		attribute.String("ws.message_id", messageID),
		attribute.String("ws.client_id", client.id),
	}
	if client.AccountID != "" {
		attrs = append(attrs, attribute.String("account_id", client.AccountID))
	}
	if client.SessionID != "" {
		attrs = append(attrs, attribute.String("session_id", client.SessionID))
	}

	ctx, span := wsTracer.Start(ctx, "ws."+messageType, trace.WithAttributes(attrs...))

	logs.AttachDebugStepCtx(ctx, "message_received", map[string]interface{}{
		"message_type":   messageType,
		"message_id":     messageID,
		"client_id":      client.id,
		"message_length": len(msg),
	})

	return ctx, func() { span.End() }
}

func (s *Server) runWSMessageOperation(client *Client, messageType string, msg []byte, fn func(context.Context, *Client, []byte)) {
	opCtx, end := beginWSMessageOperation(client, messageType, msg)
	defer end()
	fn(opCtx, client, msg)
}
