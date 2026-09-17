package server

import (
	"context"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/models"
	"eve-industry-planner/websocket/server/doclocklogic"
	"eve-industry-planner/websocket/server/outgoinglogic"

	eipredis "eve-industry-planner/shared/redis"
)

// lockFrameOwner is the planner a lock frame names, refused unless the session
// was granted it.
//
// Checked against the ceiling the session was granted at connect, which is held
// in memory: a lock pulse is frequent, and reading membership per frame as the
// HTTP paths do would put a database round trip behind every one.
func (s *Server) lockFrameOwner(client *Client, handle string) (models.Owner, bool) {
	owner, err := models.ParseOwnerHandle(handle, s.entityCipher)
	if err != nil {
		return models.Owner{}, false
	}
	// The account's own planner is always reachable, as it is for the scopes a
	// switch builds: the ceiling lists the planners membership adds, and an
	// account does not need a row to work alone.
	if owner == models.AccountOwner(client.AccountID) {
		return owner, true
	}
	if !s.clientScopeCeiling(client).Has(owner) {
		return models.Owner{}, false
	}
	return owner, true
}

func (s *Server) handleDocumentLockWaitlistPulseWS(ctx context.Context, client *Client, msg []byte) {
	frame, ok := doclocklogic.ParsePresence(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document lock waitlist-pulse: invalid message",
			documentlock.FailureWSInvalidMessage, "", "", nil)
		return
	}
	collection, docID := frame.Collection, frame.DocID
	owner, ok := s.lockFrameOwner(client, frame.Owner)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document lock waitlist-pulse: planner not granted",
			documentlock.FailureWSOwnerNotGranted, collection, docID, nil)
		return
	}
	out := doclocklogic.WaitlistPulse(ctx, documentlock.DepsFromClients(s.Stack), owner, client.SessionID, collection, docID)
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
	frame, ok := doclocklogic.ParsePresence(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, operation,
			"document lock "+operation+": invalid message",
			documentlock.FailureWSInvalidMessage, "", "", nil)
		return
	}
	collection, docID := frame.Collection, frame.DocID
	owner, ok := s.lockFrameOwner(client, frame.Owner)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, operation,
			"document lock "+operation+": planner not granted",
			documentlock.FailureWSOwnerNotGranted, collection, docID, nil)
		return
	}
	// Domain ingress is best-effort (no-op when Redis is unset).
	deps := documentlock.DepsFromClients(s.Stack)
	switch event {
	case "arrived":
		doclocklogic.ViewerArrived(ctx, deps, owner, client.SessionID, collection, docID)
	default:
		doclocklogic.ViewerDeparted(ctx, deps, owner, client.SessionID, collection, docID)
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

	owner, ownerOK := s.lockFrameOwner(client, req.Owner)
	if !ownerOK {
		s.queueDocumentLockLockStateBatchAck(client, req.RequestID, false, nil, nil, "planner not granted")
		finishWSLockStateBatchFailure(ctx, client, req.RequestID,
			"document lock state batch: planner not granted",
			documentlock.FailureWSOwnerNotGranted, nil)
		return
	}

	var rdb *eipredis.Redis
	if s.Stack != nil {
		rdb = s.Stack.Redis
	}
	res := doclocklogic.RunLockStateBatch(ctx, rdb, owner, req)
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
