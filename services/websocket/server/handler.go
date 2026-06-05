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
		wsUpgradeRejectClient(w, r, s, upgradeStart, "session_missing", http.StatusUnauthorized,
			"websocket upgrade rejected: missing session cookie",
			"Unauthorized: session_missing",
			"ws_upgrade_session_missing",
			map[string]interface{}{"has_eip_session_cookie": false},
		)
		return
	}

	if s.ServiceClients == nil || s.ServiceClients.Redis == nil {
		wsUpgradeRejectServer(w, r, s, upgradeStart, "redis_unavailable", http.StatusServiceUnavailable,
			"websocket upgrade rejected: Redis unavailable",
			"Service unavailable",
			"ws_upgrade_redis_unavailable",
			nil,
			nil,
		)
		return
	}

	identity, err := apihelperauth.ExtractAccountSession(reqCtx, r, s.ServiceClients.Redis)
	if err != nil {
		wsUpgradeRejectAuthSession(w, r, s, upgradeStart, err)
		return
	}
	r = logs.BindRequestIdentityToRequest(r, identity.AccountID, identity.SessionID)

	if err := apihelperauth.TouchAccountSession(reqCtx, s.ServiceClients.Redis, identity.AccountID, identity.SessionID, identity.Session.AppVersion); err != nil {
		wsUpgradeRejectClient(w, r, s, upgradeStart, "session_missing", http.StatusUnauthorized,
			"websocket upgrade rejected: failed session touch",
			"Unauthorized: session_missing",
			"ws_upgrade_session_touch_failed",
			map[string]interface{}{
				"account_id": identity.AccountID,
				"session_id": identity.SessionID,
				"reason":     err.Error(),
			},
		)
		return
	}
	wsUpgradeAttachSessionValidated(r, identity.AccountID, identity.SessionID)

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
				wsUpgradeAttachConnectionLimitEviction(r, identity.AccountID, oldestClientID, connCount, config.MaxConnectionsPerUser())

				// Send close message to client (non-blocking, best effort)
				// Use a short deadline to avoid blocking
				clientToClose.conn.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
				if err := clientToClose.conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, closeReason)); err != nil {
					logs.AttachDebugStep(r, "connection_limit_close_message_failed", map[string]interface{}{
						"evicted_client_id": oldestClientID,
						"error":             err.Error(),
					})
				}

				// Close the connection - this will cause ReadMessage to return an error
				// which triggers the reader's defer cleanup
				clientToClose.conn.Close()
			}
			s.ClientsMu.Unlock()

			// Remove from userConnections after closing to free up a slot
			delete(userConns, oldestClientID)
			if len(userConns) == 0 {
				delete(s.userConnections, identity.AccountID)
			}
		} else {
			wsUpgradeAttachConnectionLimitFallback(r, identity.AccountID, connCount)
		}
	}
	s.userConnMu.Unlock()

	// Upgrade connection
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		wsUpgradeRejectServer(w, r, s, upgradeStart, "upgrade_failed", http.StatusInternalServerError,
			"websocket upgrade failed",
			"upgrade failed",
			"ws_upgrade_failed",
			err,
			nil,
		)
		return
	}
	// Align permessage-deflate (compress/flate) with API default brotli/gzip level (see shared/compression). No-op if extension not negotiated.
	_ = conn.SetCompressionLevel(sharedcompression.FlateDefaultLevel)

	clientID := fmt.Sprintf("%p", conn)
	now := time.Now()
	connCtx := context.WithoutCancel(r.Context())
	connCtx = logs.BindRequestIdentity(connCtx, identity.AccountID, identity.SessionID)
	client := &Client{
		id:                 clientID,
		conn:               conn,
		connCtx:            connCtx,
		Send:               make(chan []byte, 256),
		explicitDocIDs:     make(map[string]bool),
		AccountID:          identity.AccountID,
		SessionID:          identity.SessionID,
		Scopes:             model.RealtimeScopes{},
		grantedCorpIDs:     stringSetFromSlice(int64SliceToStringIDs(identity.Session.Grants.CorporationIDs)),
		grantedAllianceIDs: stringSetFromSlice(int64SliceToStringIDs(identity.Session.Grants.AllianceIDs)),
		lastReset:          now,
		connectedAt:        now,
		lastActivity:       now,
	}

	s.ClientsMu.Lock()
	s.Clients[client.id] = client
	clientCount := len(s.Clients)
	s.ClientsMu.Unlock()

	s.userConnMu.Lock()
	if s.userConnections[identity.AccountID] == nil {
		s.userConnections[identity.AccountID] = make(map[string]bool)
	}
	s.userConnections[identity.AccountID][client.id] = true
	userConnCount := len(s.userConnections[identity.AccountID])
	s.userConnMu.Unlock()

	duration := time.Since(upgradeStart)
	s.recordUpgradeSuccess(connCtx, client.AccountID, duration)

	// Send clientID to client immediately after connection
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
		select {
		case client.Send <- connectionMsgBytes:
			logs.AttachDebugStep(r, "connected_message_queued", map[string]interface{}{
				"client_id": client.id,
			})
		default:
			logs.AttachHandlerCaveat(r, "connected_message_buffer_full", "failed to queue connected message (send buffer full)", map[string]interface{}{
				"client_id": client.id,
			})
		}
	} else {
		logs.AttachHandlerCaveat(r, "connected_message_marshal_failed", "failed to marshal connected message", map[string]interface{}{
			"client_id": client.id,
			"error":     err.Error(),
		})
	}

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				logs.ErrorCtx(client.LogContext(), "panic in writer goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", rec)
			}
		}()
		s.writer(client)
	}()

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				logs.ErrorCtx(client.LogContext(), "panic in reader goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", rec)
			}
		}()
		s.reader(client)
	}()

	wsUpgradeFinishSuccess(r, client, identity.Session.CharacterHash, clientCount, userConnCount, duration, r.UserAgent())
}
