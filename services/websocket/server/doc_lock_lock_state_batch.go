package server

import (
	"encoding/json"
	"errors"
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
func (s *Server) handleDocumentLockLockStateBatch(client *Client, msg []byte) {
	ctx := client.LogContext()
	var in documentLockLockStateBatchIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		logs.WarnCtx(ctx, "document_lock_lock_state_batch invalid JSON",
			"client_id", client.id,
			"account_id", client.AccountID,
			"error", err)
		return
	}
	reqID := strings.TrimSpace(in.RequestID)
	if reqID == "" {
		logs.WarnCtx(ctx, "document_lock_lock_state_batch missing requestId",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}
	if s.ServiceClients == nil {
		s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "service unavailable")
		return
	}
	jobResults, groupResults, err := documentlock.StatusBatchResults(ctx, s.ServiceClients.Redis, client.AccountID, in.JobDocIDs, in.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, documentlock.ErrStatusBatchEmpty):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, documentlock.ErrStatusBatchEmpty.Error())
		case errors.Is(err, documentlock.ErrStatusBatchTooMany):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, documentlock.ErrStatusBatchTooMany.Error())
		case errors.Is(err, documentlock.ErrLocksUnavailable):
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "locks unavailable")
		default:
			logs.WarnCtx(ctx, "document_lock_lock_state_batch failed",
				"client_id", client.id,
				"error", err)
			s.queueDocumentLockLockStateBatchAck(client, reqID, false, nil, nil, "internal error")
		}
		return
	}
	s.queueDocumentLockLockStateBatchAck(client, reqID, true, jobResults, groupResults, "")
}

func (s *Server) queueDocumentLockLockStateBatchAck(client *Client, requestID string, ok bool, jobResults, groupResults map[string]any, errMsg string) {
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
		return
	}
	if !outgoinglogic.TrySendNonBlocking(client.Send, b) {
		logs.WarnCtx(client.LogContext(), "document_lock_lock_state_batch_ack send buffer full",
			"client_id", client.id)
	}
}
