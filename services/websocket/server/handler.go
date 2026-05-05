package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	sharedcompression "eve-industry-planner/shared/compression"
	"eve-industry-planner/shared/core/internaljwt"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"
	"eve-industry-planner/websocket/server/model"

	"github.com/gorilla/websocket"
)

// HandleWS handles WebSocket requests from clients
func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	reqCtx := r.Context()
	s.recordUpgradeRequest(reqCtx)
	upgradeStart, ok := logs.RequestStartTime(reqCtx)
	if !ok || upgradeStart.IsZero() {
		upgradeStart = time.Now()
	}

	// Extract token from subprotocol header (preferred) or query parameter (fallback)
	// Format: subprotocol should be "auth.<base64-encoded-token>"
	var tokenString string
	var acceptedSubprotocol string

	// Try subprotocol first (new method - token in header)
	subprotocols := websocket.Subprotocols(r)
	logs.DebugCtx(reqCtx, "websocket connection attempt", "subprotocols", subprotocols, "ip", r.RemoteAddr)
	for _, proto := range subprotocols {
		if strings.HasPrefix(proto, "auth.") {
			// Extract base64url-encoded token from subprotocol
			// Base64URL uses - and _ instead of + and /, and has no padding
			encodedToken := strings.TrimPrefix(proto, "auth.")
			// Use Go's base64url decoder (URLEncoding with RawURLEncoding for no padding)
			// RawURLEncoding decodes base64url without requiring padding
			decodedBytes, err := base64.RawURLEncoding.DecodeString(encodedToken)
			if err == nil {
				tokenString = string(decodedBytes)
				acceptedSubprotocol = proto // Store the subprotocol to accept in response
				logs.DebugCtx(reqCtx, "extracted token from subprotocol", "ip", r.RemoteAddr)
				break
			} else {
				logs.WarnCtx(reqCtx, "failed to decode token from subprotocol", "error", err, "ip", r.RemoteAddr)
			}
		}
	}

	// Fallback to query parameter for backward compatibility
	if tokenString == "" {
		tokenString = r.URL.Query().Get("token")
		if tokenString != "" {
			logs.DebugCtx(reqCtx, "extracted token from query parameter (fallback)", "ip", r.RemoteAddr)
		}
	}

	if tokenString == "" {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "missing_token", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: missing token", "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: missing token", http.StatusUnauthorized)
		return
	}

	// Validate internal JWT (RS256, expiry, signature) on every upgrade — same module as the API.
	// The browser must open a new WebSocket when the access token rotates (~20m); JWT cannot be refreshed on the wire.
	// After upgrade, the client may send `session_resume` with the prior `clientID` so subscription slots can move without a cold baseline sync.
	claims, err := internaljwt.ValidateInternalJWT(tokenString)
	if err != nil {
		duration := time.Since(upgradeStart)
		reason := classifyUpgradeAuthError(err)
		s.recordUpgradeError(reqCtx, reason, duration)
		if reason == "expired_token" {
			s.recordExpiredTokenReject(reqCtx)
		}
		logs.WarnCtx(reqCtx, "websocket connection rejected: invalid token", "error", err, "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
		return
	}
	if strings.TrimSpace(claims.SessionID) == "" {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "missing_session_id", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: token missing session_id claim",
			"account_id", claims.AccountID,
			"ip", r.RemoteAddr,
			"duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: session claim required", http.StatusUnauthorized)
		return
	}

	if !apihelperauth.SessionUpgradeMatchesJWTClaims(r, claims) {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "session_binding_mismatch", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: session binding does not match JWT",
			"account_id", claims.AccountID,
			"ip", r.RemoteAddr,
			"duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: invalid session binding", http.StatusUnauthorized)
		return
	}

	if s.ServiceClients == nil || s.ServiceClients.Redis == nil {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "redis_unavailable", duration)
		logs.ErrorCtx(reqCtx, "websocket connection rejected: Redis unavailable for session validation",
			"account_id", claims.AccountID,
			"ip", r.RemoteAddr,
			"duration_ms", duration.Milliseconds())
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}

	if !apihelperauth.SessionRedisMatchesJWTClaims(reqCtx, s.ServiceClients.Redis, claims) {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "redis_session_invalid", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: Redis session missing or account mismatch",
			"account_id", claims.AccountID,
			"ip", r.RemoteAddr,
			"duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: invalid session", http.StatusUnauthorized)
		return
	}

	// Check connection limit per user
	s.userConnMu.Lock()
	userConns := s.userConnections[claims.AccountID]
	if userConns == nil {
		userConns = make(map[string]bool)
		s.userConnections[claims.AccountID] = userConns
	}
	connCount := len(userConns)
	if connCount >= config.MaxConnectionsPerUser() {
		// Close the oldest connection to make room for the new one
		var oldestClientID string
		var oldestTime time.Time
		first := true

		// Find the oldest client for this user
		s.ClientsMu.RLock()
		for clientID := range userConns {
			if client, exists := s.Clients[clientID]; exists {
				if first || client.connectedAt.Before(oldestTime) {
					oldestTime = client.connectedAt
					oldestClientID = clientID
					first = false
				}
			}
		}
		s.ClientsMu.RUnlock()

		// Close the oldest connection if found
		if oldestClientID != "" {
			s.ClientsMu.Lock()
			if clientToClose, exists := s.Clients[oldestClientID]; exists {
				closeReason := "Connection limit exceeded - closing oldest connection"
				logs.WarnCtx(reqCtx, "closing oldest connection to make room for new connection - multiple connections detected",
					"account_id", claims.AccountID,
					"client_id", oldestClientID,
					"current_connections", connCount,
					"max_connections", config.MaxConnectionsPerUser(),
					"ip", r.RemoteAddr,
					"note", "This suggests old connections aren't being closed when token refreshes")

				// Send close message to client (non-blocking, best effort)
				// Use a short deadline to avoid blocking
				clientToClose.conn.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
				if err := clientToClose.conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, closeReason)); err != nil {
					// If write fails, connection is likely already closed - that's fine
					logs.DebugCtx(reqCtx, "failed to send close message to client (connection may already be closed)",
						"client_id", oldestClientID,
						"error", err)
				}

				// Close the connection - this will cause ReadMessage to return an error
				// which triggers the reader's defer cleanup and logs the disconnection
				clientToClose.conn.Close()
			}
			s.ClientsMu.Unlock()

			// Remove from userConnections after closing to free up a slot
			// The reader's defer will also try to remove it, but that's safe (idempotent)
			// We do it here to ensure the slot is freed immediately for the new connection
			delete(userConns, oldestClientID)
			if len(userConns) == 0 {
				delete(s.userConnections, claims.AccountID)
			}
		} else {
			// Fallback: if we couldn't find any client to close, log and continue
			// This shouldn't happen, but we allow the connection to proceed
			logs.WarnCtx(reqCtx, "connection limit reached but could not find client to close",
				"account_id", claims.AccountID,
				"current_connections", connCount,
				"ip", r.RemoteAddr)
		}
	}
	s.userConnMu.Unlock()

	// Prepare response header to accept subprotocol if we found one
	responseHeader := make(http.Header)
	if acceptedSubprotocol != "" {
		responseHeader.Set("Sec-WebSocket-Protocol", acceptedSubprotocol)
		logs.DebugCtx(reqCtx, "accepting subprotocol in upgrade response", "subprotocol", acceptedSubprotocol, "ip", r.RemoteAddr)
	}

	// Upgrade connection
	conn, err := s.upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "upgrade_failed", duration)
		logs.ErrorCtx(reqCtx, "websocket upgrade failed", "error", err, "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "upgrade failed", http.StatusInternalServerError)
		return
	}
	// Align permessage-deflate (compress/flate) with API default brotli/gzip level (see shared/compression). No-op if extension not negotiated.
	_ = conn.SetCompressionLevel(sharedcompression.FlateDefaultLevel)

	clientID := fmt.Sprintf("%p", conn)
	now := time.Now()
	connCtx := context.WithoutCancel(reqCtx)
	client := &Client{
		id:                 clientID,
		conn:               conn,
		connCtx:            connCtx,
		Send:               make(chan []byte, 256),
		explicitDocIDs:     make(map[string]bool),
		AccountID:          claims.AccountID,
		SessionID:          claims.SessionID,
		Scopes:             model.RealtimeScopes{},
		allowedCorpJWT:     stringSetFromSlice(int64SliceToStringIDs([]int64(claims.Corporations))),
		allowedAllianceJWT: stringSetFromSlice(int64SliceToStringIDs([]int64(claims.Alliances))),
		lastReset:          now,
		connectedAt:        now,
		lastActivity:       now,
	}

	// Enforce one live websocket client per session id.
	s.sessionConnMu.Lock()
	previousClientID := s.sessionConnections[claims.SessionID]
	s.sessionConnections[claims.SessionID] = client.id
	s.sessionConnMu.Unlock()

	if previousClientID != "" && previousClientID != client.id {
		s.recordDuplicateSessionClient(connCtx, claims.AccountID, claims.SessionID)
		logs.WarnCtx(connCtx, "duplicate websocket client detected for session; evicting previous connection",
			"account_id", claims.AccountID,
			"session_id", claims.SessionID,
			"previous_client_id", previousClientID,
			"new_client_id", client.id,
			"eviction_reason", "duplicate_session_client")
		s.ClientsMu.RLock()
		oldClient := s.Clients[previousClientID]
		s.ClientsMu.RUnlock()
		if oldClient != nil && oldClient.conn != nil {
			oldClient.conn.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
			_ = oldClient.conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, "Session replaced by newer connection"))
			_ = oldClient.conn.Close()
		}
	}

	s.ClientsMu.Lock()
	s.Clients[client.id] = client
	clientCount := len(s.Clients)
	s.ClientsMu.Unlock()

	// Track user connection (ensure map is initialized)
	s.userConnMu.Lock()
	if s.userConnections[claims.AccountID] == nil {
		s.userConnections[claims.AccountID] = make(map[string]bool)
	}
	s.userConnections[claims.AccountID][client.id] = true
	userConnCount := len(s.userConnections[claims.AccountID])
	s.userConnMu.Unlock()

	duration := time.Since(upgradeStart)
	s.recordUpgradeSuccess(connCtx, client.AccountID, duration)

	logs.InfoCtx(connCtx, "websocket client connected",
		"client_id", client.id,
		"character_hash", claims.CharacterHash,
		"account_id", client.AccountID,
		"session_id", client.SessionID,
		"total_clients", clientCount,
		"user_connections", userConnCount,
		"duration_ms", duration.Milliseconds(),
		"user_agent", r.UserAgent())

	// Verify connection is valid before starting goroutines
	if client.conn == nil {
		logs.ErrorCtx(connCtx, "websocket connection is nil, cannot start goroutines",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}

	// Send clientID to client immediately after connection
	// This allows frontend to track the server-assigned clientID
	connectionMsg := map[string]interface{}{
		"type":     "connected",
		"clientID": client.id,
		"subscription": map[string]interface{}{
			"account":     true,
			"corporation": false,
			"alliance":    false,
		},
	}
	connectionMsgBytes, err := json.Marshal(connectionMsg)
	if err == nil {
		// Send connection message with clientID (non-blocking, best effort)
		select {
		case client.Send <- connectionMsgBytes:
			logs.DebugCtx(connCtx, "sent clientID to client",
				"client_id", client.id,
				"account_id", client.AccountID)
		default:
			logs.WarnCtx(connCtx, "failed to send clientID to client (send buffer full)",
				"client_id", client.id,
				"account_id", client.AccountID)
		}
	} else {
		logs.WarnCtx(connCtx, "failed to marshal connection message",
			"client_id", client.id,
			"account_id", client.AccountID,
			"error", err)
	}

	// Start writer goroutine for sending messages and pings
	logs.DebugCtx(connCtx, "starting websocket writer goroutine",
		"client_id", client.id,
		"account_id", client.AccountID)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logs.ErrorCtx(client.LogContext(), "panic in writer goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", r)
			}
		}()
		s.writer(client)
	}()

	// Start reader goroutine (blocks until connection closes)
	// This MUST be started or messages won't be received
	logs.DebugCtx(connCtx, "starting websocket reader goroutine",
		"client_id", client.id,
		"account_id", client.AccountID)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logs.ErrorCtx(client.LogContext(), "panic in reader goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", r)
			}
		}()
		s.reader(client)
	}()

	logs.DebugCtx(connCtx, "websocket upgrade handler finished, reader and writer started",
		"client_id", client.id,
		"account_id", client.AccountID)
}

func classifyUpgradeAuthError(err error) string {
	if err == nil {
		return "invalid_token"
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "expired") || strings.Contains(msg, "exp") {
		return "expired_token"
	}
	return "invalid_token"
}
