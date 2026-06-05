package server

import (
	"context"
	"encoding/json"
	"strings"

	"eve-industry-planner/shared/logs"
)

func (s *Server) handleSessionResumeWS(ctx context.Context, client *Client, msg []byte) {
	var resume struct {
		PreviousClientID string `json:"previousClientID"`
	}
	if err := json.Unmarshal(msg, &resume); err != nil {
		finishWSOperationFailure(ctx, client, "session_resume",
			"websocket session resume: invalid message",
			"ws_session_resume_invalid_message", map[string]interface{}{
				"error": err.Error(),
			})
		return
	}
	prev := strings.TrimSpace(resume.PreviousClientID)
	if prev == "" {
		finishWSOperationFailure(ctx, client, "session_resume",
			"websocket session resume: missing previousClientID",
			"ws_session_resume_missing_previous_client_id", nil)
		return
	}
	if prev == client.id {
		finishWSOperationFailure(ctx, client, "session_resume",
			"websocket session resume: previousClientID matches current client",
			"ws_session_resume_same_client", map[string]interface{}{
				"previous_client_id": prev,
			})
		return
	}

	wsAppendDebugStep(ctx, "session_resume_request", map[string]interface{}{
		"previous_client_id": prev,
	})

	result := s.ApplySessionResume(ctx, client, prev)
	if len(result.UnauthorizedDocIDs) > 0 {
		logs.AttachHandlerCaveatCtx(ctx, "session_resume_unauthorized_docs",
			"skipped unauthorized doc ids during session resume", map[string]interface{}{
				"doc_ids": strings.Join(result.UnauthorizedDocIDs, ","),
			})
	}

	ackDelivered := s.queueResumeAck(client, result.SkipBaselineSync, result.RestoredDocIDs)
	if !ackDelivered {
		logs.AttachHandlerCaveatCtx(ctx, "session_resume_ack_buffer_full",
			"resume_ack not delivered", map[string]interface{}{
				"client_id": client.id,
			})
	}
	if result.ScopesRestored {
		if !s.queueScopesAck(client) {
			logs.AttachHandlerCaveatCtx(ctx, "session_resume_scopes_ack_buffer_full",
				"scopes_ack not delivered after resume", map[string]interface{}{
					"client_id": client.id,
				})
		}
	}

	extra := map[string]interface{}{
		"previous_client_id":   prev,
		"handoff_applied":      result.HandoffApplied,
		"skip_baseline_sync":   result.SkipBaselineSync,
		"scopes_restored":      result.ScopesRestored,
		"restored_doc_count":   len(result.RestoredDocIDs),
		"ack_delivered":        ackDelivered,
		"unauthorized_skipped": len(result.UnauthorizedDocIDs),
	}
	if len(result.RestoredDocIDs) > 0 {
		extra["restored_doc_ids"] = strings.Join(result.RestoredDocIDs, ",")
	}
	if len(result.UnauthorizedDocIDs) > 0 {
		extra["unauthorized_doc_ids"] = strings.Join(result.UnauthorizedDocIDs, ",")
	}

	successLevel := "info"
	if !ackDelivered {
		successLevel = ""
	}
	finishWSOperationSuccess(ctx, client, "session_resume", "websocket session resume", extra, successLevel)
}
