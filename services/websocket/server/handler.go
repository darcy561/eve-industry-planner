package server

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"eve-industry-planner/shared/shared/logs"
	"eve-industry-planner/shared/shared/metrics"
	"eve-industry-planner/websocket/auth"

	"github.com/gorilla/websocket"
)

// HandleWS handles WebSocket requests from clients
func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	m := metrics.GetWebSocket()

	// Log all connection attempts (even failed ones)
	logs.Info("websocket connection attempt received",
		"ip", r.RemoteAddr,
		"method", r.Method,
		"path", r.URL.Path,
		"user_agent", r.UserAgent())

	// Extract token from subprotocol header (preferred) or query parameter (fallback)
	// Format: subprotocol should be "auth.<base64-encoded-token>"
	var tokenString string
	var acceptedSubprotocol string

	// Try subprotocol first (new method - token in header)
	subprotocols := websocket.Subprotocols(r)
	logs.Debug("websocket connection attempt", "subprotocols", subprotocols, "ip", r.RemoteAddr)
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
				logs.Debug("extracted token from subprotocol", "ip", r.RemoteAddr)
				break
			} else {
				logs.Warn("failed to decode token from subprotocol", "error", err, "ip", r.RemoteAddr)
			}
		}
	}

	// Fallback to query parameter for backward compatibility
	if tokenString == "" {
		tokenString = r.URL.Query().Get("token")
		if tokenString != "" {
			logs.Debug("extracted token from query parameter (fallback)", "ip", r.RemoteAddr)
		}
	}

	if tokenString == "" {
		duration := time.Since(start)
		m.ConnectionErrors.WithLabelValues("missing_token").Inc()
		metrics.LogWebSocketRequestMetrics("connection", duration, "missing_token", "ip", r.RemoteAddr)
		logs.Warn("websocket connection rejected: missing token", "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized: missing token", http.StatusUnauthorized)
		return
	}

	// Validate internal JWT token
	claims, err := auth.ValidateInternalJWT(tokenString)
	if err != nil {
		duration := time.Since(start)
		m.ConnectionErrors.WithLabelValues("invalid_token").Inc()
		metrics.LogWebSocketRequestMetrics("connection", duration, "invalid_token", "error", err, "ip", r.RemoteAddr)
		logs.Warn("websocket connection rejected: invalid token", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "Unauthorized: invalid token", http.StatusUnauthorized)
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
	if connCount >= MaxConnectionsPerUser {
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
				logs.Warn("closing oldest connection to make room for new connection - multiple connections detected",
					"account_id", claims.AccountID,
					"client_id", oldestClientID,
					"current_connections", connCount,
					"max_connections", MaxConnectionsPerUser,
					"ip", r.RemoteAddr,
					"note", "This suggests old connections aren't being closed when token refreshes")

				// Send close message to client (non-blocking, best effort)
				// Use a short deadline to avoid blocking
				clientToClose.conn.SetWriteDeadline(time.Now().Add(100 * time.Millisecond))
				if err := clientToClose.conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, closeReason)); err != nil {
					// If write fails, connection is likely already closed - that's fine
					logs.Debug("failed to send close message to client (connection may already be closed)",
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
			logs.Warn("connection limit reached but could not find client to close",
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
		logs.Debug("accepting subprotocol in upgrade response", "subprotocol", acceptedSubprotocol, "ip", r.RemoteAddr)
	}

	// Upgrade connection
	conn, err := s.upgrader.Upgrade(w, r, responseHeader)
	if err != nil {
		duration := time.Since(start)
		m.UpgradeErrors.Inc()
		m.ConnectionErrors.WithLabelValues("upgrade_failed").Inc()
		metrics.LogWebSocketRequestMetrics("connection", duration, "upgrade_failed", "error", err, "ip", r.RemoteAddr)
		logs.Error("websocket upgrade failed", "error", err, "ip", r.RemoteAddr)
		http.Error(w, "upgrade failed", http.StatusInternalServerError)
		return
	}

	clientID := fmt.Sprintf("%p", conn)
	now := time.Now()
	client := &Client{
		id:             clientID,
		conn:           conn,
		Send:           make(chan []byte, 256),
		subscribedDocs: make(map[string]bool),
		AccountID:      claims.AccountID,
		lastReset:      now,
		connectedAt:    now,
		lastActivity:   now,
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

	// Update metrics
	duration := time.Since(start)
	m.Connections.Inc()
	m.ActiveConnections.Set(float64(clientCount))
	m.ConnectionsPerUser.Observe(float64(userConnCount))
	m.ActiveConnectionsPerAccount.WithLabelValues(claims.AccountID).Set(float64(userConnCount))
	metrics.LogWebSocketRequestMetrics("connection", duration, "success",
		"client_id", client.id,
		"account_id", claims.AccountID,
		"total_clients", clientCount,
		"user_connections", userConnCount,
	)

	logs.Info("about to log websocket client connected",
		"client_id", client.id,
		"account_id", client.AccountID)

	logs.Info("websocket client connected",
		"client_id", client.id,
		"character_hash", claims.CharacterHash,
		"account_id", client.AccountID,
		"total_clients", clientCount)

	// Verify connection is valid before starting goroutines
	if client.conn == nil {
		logs.Error("websocket connection is nil, cannot start goroutines",
			"client_id", client.id,
			"account_id", client.AccountID)
		return
	}

	// Send clientID to client immediately after connection
	// This allows frontend to track the server-assigned clientID
	connectionMsg := map[string]interface{}{
		"type":     "connected",
		"clientID": client.id,
	}
	connectionMsgBytes, err := json.Marshal(connectionMsg)
	if err == nil {
		// Send connection message with clientID (non-blocking, best effort)
		select {
		case client.Send <- connectionMsgBytes:
			logs.Debug("sent clientID to client",
				"client_id", client.id,
				"account_id", client.AccountID)
		default:
			logs.Warn("failed to send clientID to client (send buffer full)",
				"client_id", client.id,
				"account_id", client.AccountID)
		}
	} else {
		logs.Warn("failed to marshal connection message",
			"client_id", client.id,
			"account_id", client.AccountID,
			"error", err)
	}

	// Start writer goroutine for sending messages and pings
	logs.Info("starting websocket writer goroutine",
		"client_id", client.id,
		"account_id", client.AccountID)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logs.Error("panic in writer goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", r)
			}
		}()
		s.writer(client)
	}()

	// Start reader goroutine (blocks until connection closes)
	// This MUST be started or messages won't be received
	logs.Info("starting websocket reader goroutine",
		"client_id", client.id,
		"account_id", client.AccountID)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				logs.Error("panic in reader goroutine startup",
					"client_id", client.id,
					"account_id", client.AccountID,
					"panic", r)
			}
		}()
		s.reader(client)
	}()

	logs.Info("websocket handler completed, goroutines started",
		"client_id", client.id,
		"account_id", client.AccountID)
}
