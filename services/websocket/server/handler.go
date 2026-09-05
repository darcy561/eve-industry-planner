package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	apihelperauth "eve-industry-planner/api/helper/auth"
	sharedcompression "eve-industry-planner/shared/compression"
	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/websocket/server/config"
	"eve-industry-planner/websocket/server/model"

	"github.com/gorilla/websocket"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     checkOrigin,
	// RFC 7692: negotiate permessage-deflate when the client offers it. Flate level is set
	// after upgrade to match shared/compression.FlateDefaultLevel (API default HTTP tier).
	EnableCompression: true,
}

// checkOrigin allows browser origins listed in config.AllowedOrigins. The proxy chain
// rewrites Host to the backend address, so gorilla's same-origin default can never match.
// A request with no Origin header is not browser-initiated and is allowed.
func checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	origin = strings.TrimSuffix(strings.ToLower(origin), "/")
	for _, allowed := range config.AllowedOrigins() {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

// HandleWS handles WebSocket requests from clients
func (s *Server) HandleWS(w http.ResponseWriter, r *http.Request) {
	// otelhttp cannot wrap this route (gorilla's Upgrade needs the ResponseWriter to be a
	// Hijacker), so the server span is opened by hand. It covers the handshake only: a connection
	// lives for hours and per-message spans are opened separately.
	ctx, span := telemetry.Tracer("websocket").Start(
		otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header)),
		r.Method+" /ws",
		trace.WithSpanKind(trace.SpanKindServer),
	)
	defer span.End()
	r = r.WithContext(ctx)

	reqCtx := r.Context()
	s.recordUpgradeRequest(reqCtx)
	upgradeStart, ok := logs.RequestStartTime(reqCtx)
	if !ok || upgradeStart.IsZero() {
		upgradeStart = time.Now()
	}

	// Local draining only here — cutoff runs after session is available.
	if s.IsDraining() {
		_ = s.rejectUpgradeBlocked(w, r, upgradeStart, "draining")
		return
	}

	if apihelperauth.ResolvePlannerSessionID(r) == "" {
		wsUpgradeRejectClient(w, r, s, upgradeStart, "session_missing", http.StatusUnauthorized,
			"websocket upgrade rejected: missing planner session",
			"Unauthorized: session_missing",
			"ws_upgrade_session_missing",
			map[string]any{
				"has_eip_session_cookie":       apihelperauth.ReadAppSessionCookie(r) != "",
				"has_planner_session_id_query": strings.TrimSpace(r.URL.Query().Get(apihelperauth.PlannerSessionIDQueryParam)) != "",
			},
		)
		return
	}

	if s.Stack == nil || s.Stack.Redis == nil {
		wsUpgradeRejectServer(w, r, s, upgradeStart, "redis_unavailable", http.StatusServiceUnavailable,
			"websocket upgrade rejected: Redis unavailable",
			"Service unavailable",
			"ws_upgrade_redis_unavailable",
			nil,
			nil,
		)
		return
	}

	if s.rejectUpgradeBlocked(w, r, upgradeStart, s.upgradeBlockReason(reqCtx, true)) {
		return
	}

	identity, err := apihelperauth.ExtractAccountSession(reqCtx, r, s.Stack.Redis)
	if err != nil {
		wsUpgradeRejectAuthSession(w, r, s, upgradeStart, err)
		return
	}
	r = logs.BindRequestIdentityToRequest(r, identity.AccountID, identity.SessionID)

	if err := apihelperauth.TouchAccountSession(reqCtx, s.Stack.Redis, identity.AccountID, identity.SessionID, identity.Session.AppVersion); err != nil {
		wsUpgradeRejectClient(w, r, s, upgradeStart, "session_missing", http.StatusUnauthorized,
			"websocket upgrade rejected: failed session touch",
			"Unauthorized: session_missing",
			"ws_upgrade_session_touch_failed",
			map[string]any{
				"account_id": identity.AccountID,
				"session_id": identity.SessionID,
				"reason":     err.Error(),
			},
		)
		return
	}
	wsUpgradeAttachSessionValidated(r, identity.AccountID, identity.SessionID)

	// Re-check after auth/session work — drain/cutoff may have flipped mid-upgrade.
	if s.rejectUpgradeBlocked(w, r, upgradeStart, s.upgradeBlockReason(reqCtx, true)) {
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
				wsUpgradeAttachConnectionLimitEviction(r, identity.AccountID, oldestClientID, connCount, config.MaxConnectionsPerUser())

				if err := clientToClose.writeFrame(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, closeReason),
					100*time.Millisecond); err != nil {
					logs.AttachDebugStep(r, "connection_limit_close_message_failed", map[string]any{
						"evicted_client_id": oldestClientID,
						"error":             err.Error(),
					})
				}

				// Close the connection - this will cause ReadMessage to return an error
				// which triggers the reader's defer cleanup
				_ = clientToClose.conn.Close()
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
	// Hijacked — cannot HTTP-reject; drop if drain/cutoff flipped during Upgrade.
	if reason := s.upgradeBlockReason(reqCtx, false); reason != "" {
		logs.WarnCtx(reqCtx, "websocket upgraded while container closed; closing without register",
			"reason", reason)
		_ = conn.Close()
		return
	}
	// Align permessage-deflate (compress/flate) with API default brotli/gzip level (see shared/compression). No-op if extension not negotiated.
	_ = conn.SetCompressionLevel(sharedcompression.FlateDefaultLevel)

	clientID := fmt.Sprintf("%p", conn)
	now := time.Now()
	connCtx := context.WithoutCancel(r.Context())
	connCtx = logs.BindRequestIdentity(connCtx, identity.AccountID, identity.SessionID)
	client := &Client{
		id:                  clientID,
		conn:                conn,
		connCtx:             connCtx,
		Send:                make(chan []byte, 256),
		explicitDocIDs:      make(map[string]bool),
		AccountID:           identity.AccountID,
		SessionID:           identity.SessionID,
		Scopes:              model.RealtimeScopes{},
		grantedCorpRefs:     stringSetFromSlice(identity.Session.Grants.CorporationRefs),
		grantedAllianceRefs: stringSetFromSlice(identity.Session.Grants.AllianceRefs),
		lastReset:           now,
		connectedAt:         now,
		lastActivity:        now,
	}

	s.ClientsMu.Lock()
	s.Clients[client.id] = client
	clientCount := len(s.Clients)
	s.ClientsMu.Unlock()
	s.syncPlacementFlags(connCtx, clientCount)

	s.userConnMu.Lock()
	if s.userConnections[identity.AccountID] == nil {
		s.userConnections[identity.AccountID] = make(map[string]bool)
	}
	s.userConnections[identity.AccountID][client.id] = true
	userConnCount := len(s.userConnections[identity.AccountID])
	s.userConnMu.Unlock()
	s.scheduleDocFanoutFilterReconcile()

	duration := time.Since(upgradeStart)
	s.recordUpgradeSuccess(connCtx, client.AccountID, duration)

	// Send clientID + hosting container id immediately after connection
	// (container_id lets edge clients / soak observe place without Redis).
	connectionMsg := map[string]any{
		"type":         "connected",
		"clientID":     client.id,
		"container_id": container.ID(),
		"subscription": map[string]any{
			"account":     true,
			"corporation": false,
			"alliance":    false,
		},
	}
	connectionMsgBytes, err := json.Marshal(connectionMsg)
	if err == nil {
		select {
		case client.Send <- connectionMsgBytes:
			logs.AttachDebugStep(r, "connected_message_queued", map[string]any{
				"client_id": client.id,
			})
		default:
			logs.AttachHandlerCaveat(r, "connected_message_buffer_full", "failed to queue connected message (send buffer full)", map[string]any{
				"client_id": client.id,
			})
		}
	} else {
		logs.AttachHandlerCaveat(r, "connected_message_marshal_failed", "failed to marshal connected message", map[string]any{
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
