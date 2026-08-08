package server

import (
	"context"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/doclocklogic"
	"eve-industry-planner/websocket/server/outgoinglogic"

	"github.com/redis/go-redis/v9"
)

func (s *Server) handleDocumentLockWaitlistPulseWS(ctx context.Context, client *Client, msg []byte) {
	collection, docID, ok := doclocklogic.ParsePresence(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document lock waitlist-pulse: invalid message",
			documentlock.FailureWSInvalidMessage, "", "", nil)
		return
	}
	out := doclocklogic.WaitlistPulse(ctx, documentlock.DepsFromClients(s.Stack), client.AccountID, client.SessionID, collection, docID)
	if !out.OK() {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse", out.Msg, out.FailureClass, collection, docID, out.Extra)
		return
	}
	finishWSDocumentLockSuccess(ctx, client, "waitlist-pulse", "document lock waitlist-pulse", collection, docID, nil, "")
}

func (s *Server) handleDocumentLockViewerArrivedWS(ctx context.Context, client *Client, msg []byte) {
	s.handleDocumentLockViewerPresenceWS(ctx, client, msg, "arrived")
}

func (s *Server) handleDocumentLockViewerDepartedWS(ctx context.Context, client *Client, msg []byte) {
	s.handleDocumentLockViewerPresenceWS(ctx, client, msg, "departed")
}

func (s *Server) handleDocumentLockViewerPresenceWS(ctx context.Context, client *Client, msg []byte, event string) {
	operation := "viewer-" + event
	collection, docID, ok := doclocklogic.ParsePresence(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, operation,
			"document lock "+operation+": invalid message",
			documentlock.FailureWSInvalidMessage, "", "", nil)
		return
	}
	// Domain ingress is best-effort (no-op when Redis is unset).
	deps := documentlock.DepsFromClients(s.Stack)
	switch event {
	case "arrived":
		doclocklogic.ViewerArrived(ctx, deps, client.AccountID, client.SessionID, collection, docID)
	default:
		doclocklogic.ViewerDeparted(ctx, deps, client.AccountID, client.SessionID, collection, docID)
	}
	wsAttachViewerPresenceStep(ctx, client, event, collection, docID)
	finishWSDocumentLockSuccess(ctx, client, operation, "document lock "+operation, collection, docID, nil, "")
}

// handleDocumentLockLockStateBatch serves the same data as POST /api/v1/document-locks/lock-state-batch over the socket.
func (s *Server) handleDocumentLockLockStateBatch(ctx context.Context, client *Client, msg []byte) {
	req, ok, parseErr := doclocklogic.ParseLockStateBatch(msg)
	if parseErr != nil {
		finishWSLockStateBatchFailure(ctx, client, "", "document lock state batch: invalid request body", documentlock.FailureStateBatchBadRequest, map[string]any{
			"error": parseErr.Error(),
		})
		return
	}
	if !ok {
		finishWSLockStateBatchFailure(ctx, client, "", "document lock state batch: missing requestId", documentlock.FailureStateBatchBadRequest, nil)
		return
	}
	wsAppendDebugStep(ctx, "lock_state_batch_request", map[string]any{
		"request_id":      req.RequestID,
		"job_doc_count":   len(req.JobDocIDs),
		"group_doc_count": len(req.GroupDocIDs),
	})

	var rdb *redis.Client
	if s.Stack != nil {
		rdb = s.Stack.Redis
	}
	res := doclocklogic.RunLockStateBatch(ctx, rdb, client.AccountID, req)
	if !res.OK() {
		s.queueDocumentLockLockStateBatchAck(client, res.RequestID, res.AckOK, res.JobResults, res.GroupResults, res.AckErrMsg)
		finishWSLockStateBatchFailure(ctx, client, res.RequestID, res.LogMsg, res.FailureClass, res.Extra)
		return
	}
	ackSent := s.queueDocumentLockLockStateBatchAck(client, res.RequestID, res.AckOK, res.JobResults, res.GroupResults, res.AckErrMsg)
	if !ackSent {
		logs.AttachHandlerCaveatCtx(ctx, "lock_state_batch_ack_buffer_full", "document lock lock-state-batch ack not delivered", map[string]any{
			"request_id": res.RequestID,
			"client_id":  client.id,
		})
		wsAppendDebugStep(ctx, "lock_state_batch_ack_dropped", map[string]any{
			"request_id": res.RequestID,
			"client_id":  client.id,
		})
	} else {
		wsAppendDebugStep(ctx, "lock_state_batch_ack_queued", map[string]any{
			"request_id": res.RequestID,
			"client_id":  client.id,
		})
	}
	finishWSLockStateBatchSuccess(ctx, client, res.RequestID, res.JobDocCount, res.GroupDocCount, ackSent)
}

func (s *Server) queueDocumentLockLockStateBatchAck(client *Client, requestID string, ok bool, jobResults, groupResults map[string]any, errMsg string) bool {
	b, err := doclocklogic.MarshalLockStateBatchAck(requestID, ok, jobResults, groupResults, errMsg)
	if err != nil {
		return false
	}
	return outgoinglogic.TrySendNonBlocking(client.Send, b)
}
