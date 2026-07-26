package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"eve-industry-planner/shared/core/documentlock"
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

func (s *Server) handleDocumentLockWaitlistPulseWS(ctx context.Context, client *Client, msg []byte) {
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document lock waitlist-pulse: invalid message",
			"doc_lock_ws_invalid_message", "", "", nil)
		return
	}
	if s.Stack == nil || s.Stack.Redis == nil {
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document locks unavailable",
			"doc_lock_unavailable", collection, docID, nil)
		return
	}
	svc := documentlock.NewService(documentlock.DepsFromClients(s.Stack))
	if err := svc.WaitlistPulse(ctx, client.AccountID, client.SessionID, collection, docID); err != nil {
		if errors.Is(err, documentlock.ErrLocksUnavailable) {
			finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
				"document locks unavailable",
				"doc_lock_unavailable", collection, docID, nil)
			return
		}
		finishWSDocumentLockClientFailure(ctx, client, "waitlist-pulse",
			"document lock waitlist-pulse failed",
			"doc_lock_waitlist_pulse_failed", collection, docID, map[string]interface{}{
				"error": err.Error(),
			})
		return
	}
	finishWSDocumentLockSuccess(ctx, client, "waitlist-pulse", "document lock waitlist-pulse", collection, docID, nil)
}

func (s *Server) handleDocumentLockViewerArrivedWS(ctx context.Context, client *Client, msg []byte) {
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "viewer-arrived",
			"document lock viewer-arrived: invalid message",
			"doc_lock_ws_invalid_message", "", "", nil)
		return
	}
	if s.Stack == nil {
		finishWSDocumentLockClientFailure(ctx, client, "viewer-arrived",
			"document locks unavailable",
			"doc_lock_unavailable", collection, docID, nil)
		return
	}
	documentlock.HandleViewerArrivedIngress(ctx, documentlock.DepsFromClients(s.Stack), client.AccountID, client.SessionID, collection, docID)
	wsAttachViewerPresenceStep(ctx, client, "arrived", collection, docID)
	finishWSDocumentLockSuccess(ctx, client, "viewer-arrived", "document lock viewer-arrived", collection, docID, nil)
}

func (s *Server) handleDocumentLockViewerDepartedWS(ctx context.Context, client *Client, msg []byte) {
	collection, docID, ok := parseDocumentLockPresenceIncoming(msg)
	if !ok {
		finishWSDocumentLockClientFailure(ctx, client, "viewer-departed",
			"document lock viewer-departed: invalid message",
			"doc_lock_ws_invalid_message", "", "", nil)
		return
	}
	if s.Stack == nil {
		finishWSDocumentLockClientFailure(ctx, client, "viewer-departed",
			"document locks unavailable",
			"doc_lock_unavailable", collection, docID, nil)
		return
	}
	documentlock.HandleViewerDepartedIngress(ctx, documentlock.DepsFromClients(s.Stack), client.AccountID, client.SessionID, collection, docID)
	wsAttachViewerPresenceStep(ctx, client, "departed", collection, docID)
	finishWSDocumentLockSuccess(ctx, client, "viewer-departed", "document lock viewer-departed", collection, docID, nil)
}
