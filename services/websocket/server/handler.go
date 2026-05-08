package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	sharedcompression "eve-industry-planner/shared/compression"
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

	if apihelperauth.ReadAppSessionCookie(r) == "" {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "session_missing", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: missing session cookie", "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: session_missing", http.StatusUnauthorized)
		return
	}

	if s.ServiceClients == nil || s.ServiceClients.Redis == nil {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "redis_unavailable", duration)
		logs.ErrorCtx(reqCtx, "websocket connection rejected: Redis unavailable for session validation", "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}

	identity, err := apihelperauth.ExtractAccountSession(reqCtx, r, s.ServiceClients.Redis)
	if err != nil {
		duration := time.Since(upgradeStart)
		reason := err.Error()
		s.recordUpgradeError(reqCtx, reason, duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: invalid session", "reason", reason, "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: "+reason, http.StatusUnauthorized)
		return
	}
	if err := apihelperauth.TouchAccountSession(reqCtx, s.ServiceClients.Redis, identity.AccountID, identity.SessionID, identity.Session.AppVersion); err != nil {
		duration := time.Since(upgradeStart)
		s.recordUpgradeError(reqCtx, "session_missing", duration)
		logs.WarnCtx(reqCtx, "websocket connection rejected: failed session touch", "error", err, "ip", r.RemoteAddr, "duration_ms", duration.Milliseconds())
		http.Error(w, "Unauthorized: session_missing", http.StatusUnauthorized)
		return
	}

	// Check connection limit per user
	s.userConnMu.Lock()
	userConns := s.userConnections[identity.AccountID]
	if userConns == nil {
		userConns = make(map[string]bool)
		s.userConnections[identity.AccountID] = userConns
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
					"account_id", identity.AccountID,
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
				delete(s.userConnections, identity.AccountID)
			}
		} else {
			// Fallback: if we couldn't find any client to close, log and continue
			// This shouldn't happen, but we allow the connection to proceed
			logs.WarnCtx(reqCtx, "connection limit reached but could not find client to close",
				"account_id", identity.AccountID,
				"current_connections", connCount,
				"ip", r.RemoteAddr)
		}
	}
	s.userConnMu.Unlock()

	// Upgrade connection
	conn, err := s.upgrader.Upgrade(w, r, nil)
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
		AccountID:          identity.AccountID,
		SessionID:          identity.SessionID,
		Scopes:             model.RealtimeScopes{},
		allowedCorpJWT:     stringSetFromSlice(int64SliceToStringIDs(identity.Session.Grants.CorporationIDs)),
		allowedAllianceJWT: stringSetFromSlice(int64SliceToStringIDs(identity.Session.Grants.AllianceIDs)),
		lastReset:          now,
		connectedAt:        now,
		lastActivity:       now,
	}

	// Multiple tabs can legitimately share the same session cookie; do not evict by session id.

	s.ClientsMu.Lock()
	s.Clients[client.id] = client
	clientCount := len(s.Clients)
	s.ClientsMu.Unlock()

	// Track user connection (ensure map is initialized)
	s.userConnMu.Lock()
	if s.userConnections[identity.AccountID] == nil {
		s.userConnections[identity.AccountID] = make(map[string]bool)
	}
	s.userConnections[identity.AccountID][client.id] = true
	userConnCount := len(s.userConnections[identity.AccountID])
	s.userConnMu.Unlock()

	duration := time.Since(upgradeStart)
	s.recordUpgradeSuccess(connCtx, client.AccountID, duration)

	logs.InfoCtx(connCtx, "websocket client connected",
		"client_id", client.id,
		"character_hash", identity.Session.CharacterHash,
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

