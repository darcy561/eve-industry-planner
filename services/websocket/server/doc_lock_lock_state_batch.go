package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

type documentLockLockStateBatchIncoming struct {
	RequestID   string   `json:"requestId"`
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

// handleDocumentLockLockStateBatch serves the same data as POST /api/v1/document-locks/lock-state-batch over the socket.
func (s *Server) handleDocumentLockLockStateBatch(ctx context.Context, client *Client, msg []byte) {
	var in documentLockLockStateBatchIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		finishWSLockStateBatchFailure(ctx, client, "", "document lock state batch: invalid request body", "doc_lock_state_batch_bad_request", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	reqID := strings.TrimSpace(in.RequestID)
	if reqID == "" {
		finishWSLockStateBatchFailure(ctx, client, "", "document lock state batch: missing requestId", "doc_lock_state_batch_bad_request", nil)
		return
	}
	wsAppendDebugStep(ctx, "lock_state_batch_request", map[string]interface{}{
		"request_id":      reqID,
		"job_doc_count":   len(in.JobDocIDs),
		"group_doc_count": len(in.GroupDocIDs),
	})
	if s.Stack == nil {
		s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "service unavailable")
		finishWSLockStateBatchFailure(ctx, client, reqID, "document locks unavailable", "doc_lock_unavailable", nil)
		return
	}
	jobResults, groupResults, err := documentlock.StatusBatchResults(ctx, s.Stack.Redis, client.AccountID, in.JobDocIDs, in.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, documentlock.ErrStatusBatchEmpty):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, documentlock.ErrStatusBatchEmpty.Error())
			finishWSLockStateBatchFailure(ctx, client, reqID, "document lock state batch: empty request", "doc_lock_state_batch_empty", nil)
		case errors.Is(err, documentlock.ErrStatusBatchTooMany):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, documentlock.ErrStatusBatchTooMany.Error())
			finishWSLockStateBatchFailure(ctx, client, reqID,
				fmt.Sprintf("document lock state batch: too many doc ids (max %d each)", documentlock.MaxStatusBatchDocs),
				"doc_lock_state_batch_too_many", nil)
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "locks unavailable")
			finishWSLockStateBatchFailure(ctx, client, reqID, "document locks unavailable", "doc_lock_unavailable", nil)
		default:
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "internal error")
			finishWSLockStateBatchFailure(ctx, client, reqID, "document lock state batch failed", "doc_lock_state_batch_failed", map[string]interface{}{
				"error": err.Error(),
			})
		}
		return
	}
	ackSent := s.queueDocumentLockLockStateBatchAck(client, reqID, true, jobResults, groupResults, "")
	if !ackSent {
		logs.AttachHandlerCaveatCtx(ctx, "lock_state_batch_ack_buffer_full", "document lock lock-state-batch ack not delivered", map[string]interface{}{
			"request_id": reqID,
			"client_id":  client.id,
		})
		wsAppendDebugStep(ctx, "lock_state_batch_ack_dropped", map[string]interface{}{
			"request_id": reqID,
			"client_id":  client.id,
		})
	} else {
		wsAppendDebugStep(ctx, "lock_state_batch_ack_queued", map[string]interface{}{
			"request_id": reqID,
			"client_id":  client.id,
		})
	}
	finishWSLockStateBatchSuccess(ctx, client, reqID, len(in.JobDocIDs), len(in.GroupDocIDs), ackSent)
}

func (s *Server) queueDocumentLockLockStateBatchAck(client *Client, requestID string, ok bool, jobResults, groupResults map[string]any, errMsg string) bool {
	payload := map[string]any{
		"type":      "document_lock_lock_state_batch_ack",
		"requestId": requestID,
		"ok":        ok,
	}
	if ok {
		payload["jobResults"] = jobResults
		payload["groupResults"] = groupResults
	} else if errMsg != "" {
		payload["error"] = errMsg
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return false
	}
	return outgoinglogic.TrySendNonBlocking(client.Send, b)
}
