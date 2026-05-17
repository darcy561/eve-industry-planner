package server

import (
	"encoding/json"
	"errors"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
	"eve-industry-planner/shared/logs"
)

type documentLockPresenceIncoming struct {
	Collection string `json:"collection"`
	DocID      string `json:"docID"`
}

func parseDocumentLockPresenceIncoming(msg []byte) (collection, docID string, ok bool) {
	var in documentLockPresenceIncoming
	if err := json.Unmarshal(msg, &in); err != nil {
		return "", "", false
	}
	c := strings.TrimSpace(in.Collection)
	d := strings.TrimSpace(in.DocID)
	if c == "" || d == "" {
		return "", "", false
	}
	return c, d, true
}

func (s *Server) handleDocumentLockWaitlistPulseWS(client *Client, msg []byte) {
	ctx := client.LogContext()
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		logs.WarnCtx(ctx, "document_lock_waitlist_pulse invalid message",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}
	if s.ServiceClients == nil || s.ServiceClients.Redis == nil {
		return
	}
	svc := documentlock.NewService(documentlock.DepsFromServiceClients(s.ServiceClients))
	if err := svc.WaitlistPulse(ctx, client.AccountID, client.SessionID, collection, docID); err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			return
		}
		logs.WarnCtx(ctx, "document_lock_waitlist_pulse failed",
			"client_id", client.id,
			"error", err)
	}
}

func (s *Server) handleDocumentLockViewerArrivedWS(client *Client, msg []byte) {
	ctx := client.LogContext()
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		logs.WarnCtx(ctx, "document_lock_viewer_arrived invalid message",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}
	if s.ServiceClients == nil {
		return
	}
	documentlock.HandleViewerArrivedIngress(ctx, documentlock.DepsFromServiceClients(s.ServiceClients), client.AccountID, client.SessionID, collection, docID)
}

func (s *Server) handleDocumentLockViewerDepartedWS(client *Client, msg []byte) {
	ctx := client.LogContext()
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		logs.WarnCtx(ctx, "document_lock_viewer_departed invalid message",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}
	if s.ServiceClients == nil {
		return
	}
	documentlock.HandleViewerDepartedIngress(ctx, documentlock.DepsFromServiceClients(s.ServiceClients), client.AccountID, client.SessionID, collection, docID)
}
