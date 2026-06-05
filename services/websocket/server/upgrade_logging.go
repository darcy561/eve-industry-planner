package server

import (
	"net/http"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	"eve-industry-planner/shared/logs"
)

const wsUpgradeOperation = "websocket_upgrade"

func wsUpgradeRejectClient(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	reasonCode string,
	status int,
	logMsg, responseBody, failureClass string,
	extra map[string]interface{},
) {
	duration := time.Since(start)
	s.recordUpgradeError(r.Context(), reasonCode, duration)
	detail := map[string]interface{}{
		"operation":     wsUpgradeOperation,
		"failure_class": failureClass,
		"status_code":   status,
		"duration_ms":   duration.Milliseconds(),
	}
	if reasonCode != "" {
		detail["code"] = reasonCode
	}
	for k, v := range extra {
		detail[k] = v
	}
	stepExtra := map[string]interface{}{
		"reason_code":   reasonCode,
		"failure_class": failureClass,
	}
	if reasonCode != "" {
		stepExtra["code"] = reasonCode
	}
	logs.AttachDebugStep(r, "websocket_upgrade_rejected", stepExtra)
	logs.AttachClientFailureDetail(r, logMsg, detail)
	if responseBody == "" {
		responseBody = logMsg
	}
	http.Error(w, responseBody, status)
}

func wsUpgradeRejectServer(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	reasonCode string,
	status int,
	logMsg, responseBody, failureClass string,
	err error,
	extra map[string]interface{},
) {
	duration := time.Since(start)
	s.recordUpgradeError(r.Context(), reasonCode, duration)
	detail := map[string]interface{}{
		"operation":     wsUpgradeOperation,
		"failure_class": failureClass,
		"status_code":   status,
		"duration_ms":   duration.Milliseconds(),
	}
	if reasonCode != "" {
		detail["code"] = reasonCode
	}
	for k, v := range extra {
		detail[k] = v
	}
	logs.AttachDebugStep(r, "websocket_upgrade_rejected", map[string]interface{}{
		"reason_code":   reasonCode,
		"failure_class": failureClass,
	})
	logs.AttachServerFailureDetail(r, logMsg, err, detail)
	if responseBody == "" {
		responseBody = logMsg
	}
	http.Error(w, responseBody, status)
}

func wsUpgradeAttachSessionValidated(r *http.Request, accountID, sessionID string) {
	logs.AttachDebugStep(r, "session_validated", map[string]interface{}{
		"account_id": accountID,
		"session_id": sessionID,
	})
}

func wsUpgradeAttachConnectionLimitEviction(r *http.Request, accountID, evictedClientID string, connCount, maxConns int) {
	logs.AttachDebugStep(r, "connection_limit_evicted", map[string]interface{}{
		"account_id":          accountID,
		"evicted_client_id":   evictedClientID,
		"current_connections": connCount,
		"max_connections":     maxConns,
	})
	logs.AttachHandlerCaveat(r, "connection_limit_eviction", "closed oldest connection to make room for new websocket", map[string]interface{}{
		"evicted_client_id":   evictedClientID,
		"current_connections": connCount,
		"max_connections":     maxConns,
	})
}

func wsUpgradeAttachConnectionLimitFallback(r *http.Request, accountID string, connCount int) {
	logs.AttachHandlerCaveat(r, "connection_limit_fallback", "connection limit reached but no client could be evicted", map[string]interface{}{
		"account_id":          accountID,
		"current_connections": connCount,
	})
}

func wsUpgradeFinishSuccess(
	r *http.Request,
	client *Client,
	characterHash string,
	totalClients, userConnections int,
	duration time.Duration,
	userAgent string,
) {
	logs.AttachDebugStep(r, "websocket_upgrade_completed", map[string]interface{}{
		"client_id":        client.id,
		"account_id":       client.AccountID,
		"session_id":       client.SessionID,
		"total_clients":    totalClients,
		"user_connections": userConnections,
		"duration_ms":      duration.Milliseconds(),
	})
	logs.AttachHandlerSuccessDetail(r, "websocket client connected", map[string]interface{}{
		"operation":        wsUpgradeOperation,
		"client_id":          client.id,
		"account_id":         client.AccountID,
		"session_id":         client.SessionID,
		"character_hash":     characterHash,
		"total_clients":      totalClients,
		"user_connections":   userConnections,
		"duration_ms":        duration.Milliseconds(),
		"user_agent":         userAgent,
	})
}

func wsUpgradeRejectAuthSession(
	w http.ResponseWriter,
	r *http.Request,
	s *Server,
	start time.Time,
	err error,
) {
	detail := apihelperauth.AuthSessionFailureDetailFromError(err, r)
	extra := detail.ClientFailureDetail(nil)
	failureClass, _ := extra["failure_class"].(string)
	wsUpgradeRejectClient(
		w, r, s, start,
		detail.Code,
		http.StatusUnauthorized,
		detail.ClientFailureMessage(),
		"Unauthorized: "+detail.Code,
		failureClass,
		extra,
	)
}
