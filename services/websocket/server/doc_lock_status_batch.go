package server

import (
	"encoding/json"
	"errors"
	"strings"

	"eve-industry-planner/api/v1endpoints/documentlocks"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/outgoinglogic"
)

type documentLockStatusBatchIncoming struct {
	RequestID   string   `json:"requestId"`
	JobDocIDs   []string `json:"jobDocIDs"`
	GroupDocIDs []string `json:"groupDocIDs"`
}

// handleDocumentLockStatusBatch serves the same data as POST /api/v1/document-locks/status-batch over the socket.
func (s *Server) handleDocumentLockStatusBatch(client *Client, msg []byte) {
	ctx := client.LogContext()
	var in documentLockStatusBatchIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		logs.WarnCtx(ctx, "document_lock_status_batch invalid JSON",
			"client_id", client.id,
			"account_id", client.AccountID,
			"error", err)
		return
	}
	reqID := strings.TrimSpace(in.RequestID)
	if reqID == "" {
		logs.WarnCtx(ctx, "document_lock_status_batch missing requestId",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}
	if s.ServiceClients == nil {
		s.queueDocumentLockStatusBatchAck(client, reqID, false, nil, nil, "service unavailable")
		return
	}
	jobResults, groupResults, err := documentlocks.StatusBatchResults(ctx, s.ServiceClients, client.AccountID, in.JobDocIDs, in.GroupDocIDs)
	if err != nil {
		switch {
		case errors.Is(err, documentlocks.ErrStatusBatchEmpty):
			s.queueDocumentLockStatusBatchAck(client, reqID, false, nil, nil, documentlocks.ErrStatusBatchEmpty.Error())
		case errors.Is(err, documentlocks.ErrStatusBatchTooMany):
			s.queueDocumentLockStatusBatchAck(client, reqID, false, nil, nil, documentlocks.ErrStatusBatchTooMany.Error())
		case errors.Is(err, documentlocks.ErrLocksUnavailable):
			s.queueDocumentLockStatusBatchAck(client, reqID, false, nil, nil, "locks unavailable")
		default:
			logs.WarnCtx(ctx, "document_lock_status_batch failed",
				"client_id", client.id,
				"error", err)
			s.queueDocumentLockStatusBatchAck(client, reqID, false, nil, nil, "internal error")
		}
		return
	}
	s.queueDocumentLockStatusBatchAck(client, reqID, true, jobResults, groupResults, "")
}

func (s *Server) queueDocumentLockStatusBatchAck(client *Client, requestID string, ok bool, jobResults, groupResults map[string]any, errMsg string) {
	payload := map[string]any{
		"type":      "document_lock_status_batch_ack",
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
		logs.WarnCtx(client.LogContext(), "document_lock_status_batch_ack send buffer full",
			"client_id", client.id)
	}
}
