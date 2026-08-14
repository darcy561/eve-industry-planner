package server

import (
	"context"
	"encoding/json"
	"strings"

	"eve-industry-planner/shared/logs"
)

func (s *Server) handleSubscribeWS(ctx context.Context, client *Client, msg []byte) {
	var subscribeMsg struct {
		DocIDs []string `json:"docIDs"`
	}
	if err := json.Unmarshal(msg, &subscribeMsg); err != nil {
		finishWSOperationFailure(ctx, client, "subscribe",
			"websocket subscribe: invalid message",
			"ws_subscribe_invalid_message", map[string]any{
				"error": err.Error(),
			})
		return
	}
	if len(subscribeMsg.DocIDs) == 0 {
		finishWSOperationFailure(ctx, client, "subscribe",
			"websocket subscribe: missing docIDs",
			"ws_subscribe_missing_doc_ids", nil)
		return
	}

	wsAppendDebugStep(ctx, "subscribe_request", map[string]any{
		"requested_doc_count": len(subscribeMsg.DocIDs),
	})

	var enqueued, rejected, dropped []string
	for _, docID := range subscribeMsg.DocIDs {
		docID = strings.TrimSpace(docID)
		if docID == "" {
			continue
		}
		if !s.docSubscribeAuthorized(ctx, docID, client.AccountID) {
			rejected = append(rejected, docID)
			continue
		}
		if s.enqueueIncomingEvent(Event{
			ClientID: client.id,
			DocID:    docID,
			Msg:      []byte("subscribe"),
		}) {
			enqueued = append(enqueued, docID)
		} else {
			dropped = append(dropped, docID)
		}
	}

	if len(rejected) > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "subscribe_unauthorized_docs",
			"subscribe rejected unauthorized doc ids", map[string]any{
				"doc_ids": strings.Join(rejected, ","),
			})
	}
	if len(dropped) > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "subscribe_queue_full",
			"subscribe incoming queue full for doc ids", map[string]any{
				"doc_ids": strings.Join(dropped, ","),
			})
	}

	ackDelivered := false
	if len(enqueued) > 0 {
		ackDelivered = s.QueueSubscribeAck(client, enqueued)
		if !ackDelivered {
			logs.AttachHandlerCaveatCtx(ctx, "subscribe_ack_buffer_full",
				"subscribe_ack not delivered", map[string]any{
					"client_id": client.id,
				})
		}
	}

	extra := map[string]any{
		"requested_doc_count": len(subscribeMsg.DocIDs),
		"enqueued_doc_count":  len(enqueued),
		"rejected_doc_count":  len(rejected),
		"dropped_doc_count":   len(dropped),
		"ack_delivered":       ackDelivered,
	}
	if len(enqueued) > 0 {
		extra["enqueued_doc_ids"] = strings.Join(enqueued, ",")
	}
	if len(rejected) > 0 {
		extra["rejected_doc_ids"] = strings.Join(rejected, ",")
	}
	if len(dropped) > 0 {
		extra["dropped_doc_ids"] = strings.Join(dropped, ",")
	}

	switch {
	case len(enqueued) == 0 && len(rejected)+len(dropped) > 0:
		finishWSOperationFailure(ctx, client, "subscribe",
			"websocket subscribe rejected",
			"ws_subscribe_rejected", extra)
	case !ackDelivered && len(enqueued) > 0:
		finishWSOperationSuccess(ctx, client, "subscribe", "websocket subscribe", extra, "")
	default:
		finishWSOperationSuccess(ctx, client, "subscribe", "websocket subscribe", extra, "info")
	}
}

func (s *Server) handleUnsubscribeWS(ctx context.Context, client *Client, msg []byte) {
	var unsubscribeMsg struct {
		DocIDs []string `json:"docIDs"`
	}
	if err := json.Unmarshal(msg, &unsubscribeMsg); err != nil {
		finishWSOperationFailure(ctx, client, "unsubscribe",
			"websocket unsubscribe: invalid message",
			"ws_unsubscribe_invalid_message", map[string]any{
				"error": err.Error(),
			})
		return
	}
	if len(unsubscribeMsg.DocIDs) == 0 {
		finishWSOperationFailure(ctx, client, "unsubscribe",
			"websocket unsubscribe: missing docIDs",
			"ws_unsubscribe_missing_doc_ids", nil)
		return
	}

	wsAppendDebugStep(ctx, "unsubscribe_request", map[string]any{
		"requested_doc_count": len(unsubscribeMsg.DocIDs),
	})

	var enqueued, rejected, dropped []string
	for _, docID := range unsubscribeMsg.DocIDs {
		docID = strings.TrimSpace(docID)
		if docID == "" {
			continue
		}
		if !s.docSubscribeAuthorized(ctx, docID, client.AccountID) {
			rejected = append(rejected, docID)
			continue
		}
		if s.enqueueIncomingEvent(Event{
			ClientID: client.id,
			DocID:    docID,
			Msg:      []byte("unsubscribe"),
		}) {
			enqueued = append(enqueued, docID)
		} else {
			dropped = append(dropped, docID)
		}
	}

	if len(rejected) > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "unsubscribe_unauthorized_docs",
			"unsubscribe rejected unauthorized doc ids", map[string]any{
				"doc_ids": strings.Join(rejected, ","),
			})
	}
	if len(dropped) > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "unsubscribe_queue_full",
			"unsubscribe incoming queue full for doc ids", map[string]any{
				"doc_ids": strings.Join(dropped, ","),
			})
	}

	extra := map[string]any{
		"requested_doc_count": len(unsubscribeMsg.DocIDs),
		"enqueued_doc_count":  len(enqueued),
		"rejected_doc_count":  len(rejected),
		"dropped_doc_count":   len(dropped),
	}
	if len(enqueued) > 0 {
		extra["enqueued_doc_ids"] = strings.Join(enqueued, ",")
	}
	if len(rejected) > 0 {
		extra["rejected_doc_ids"] = strings.Join(rejected, ",")
	}
	if len(dropped) > 0 {
		extra["dropped_doc_ids"] = strings.Join(dropped, ",")
	}

	switch {
	case len(enqueued) == 0 && len(rejected)+len(dropped) > 0:
		finishWSOperationFailure(ctx, client, "unsubscribe",
			"websocket unsubscribe rejected",
			"ws_unsubscribe_rejected", extra)
	case len(dropped) > 0:
		finishWSOperationSuccess(ctx, client, "unsubscribe", "websocket unsubscribe", extra, "")
	default:
		finishWSOperationSuccess(ctx, client, "unsubscribe", "websocket unsubscribe", extra, "info")
	}
}
