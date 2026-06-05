package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"

	"github.com/gorilla/websocket"
)

func peekWSMessageType(msg []byte) string {
	if len(msg) == 0 || msg[0] != '{' {
		return ""
	}
	var header struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(msg, &header); err != nil {
		return ""
	}
	return header.Type
}

// isBenignWebSocketDisconnect classifies errors that usually mean the peer went away
// (tab closed, navigation, reconnect, proxy idle reset) rather than an internal failure.
func isBenignWebSocketDisconnect(err error) bool {
	if err == nil {
		return false
	}
	var ce *websocket.CloseError
	if errors.As(err, &ce) {
		switch ce.Code {
		case websocket.CloseNormalClosure,
			websocket.CloseGoingAway,
			websocket.CloseNoStatusReceived,
			websocket.CloseAbnormalClosure:
			return true
		}
	}
	es := err.Error()
	return strings.Contains(es, "close 1005") ||
		strings.Contains(es, "close 1006") ||
		strings.Contains(es, "close 1000") ||
		strings.Contains(es, "close 1001") ||
		strings.Contains(es, "use of closed network connection") ||
		strings.Contains(es, "connection reset by peer")
}

// reader reads messages from the WebSocket connection
func (s *Server) reader(client *Client) {
	ctx := client.LogContext()

	// Add panic recovery
	defer func() {
		if r := recover(); r != nil {
			logs.ErrorCtx(ctx, "websocket reader goroutine panicked",
				"client_id", client.id,
				"account_id", client.AccountID,
				"panic", r)
		}
	}()

	defer func() {
		// Snapshot subscription keys so a quick reconnect can move NATS subscriber slots to the new client_id.
		s.snapshotSessionHandoff(ctx, client)

		s.unregisterClientFromOrgPools(client)

		// Clean up explicit subscription index for this client
		s.cleanupClientSubscriptions(client.id, client.AccountID, client.explicitDocIDs)

		s.ClientsMu.Lock()
		wasInClients := s.Clients[client.id] != nil
		delete(s.Clients, client.id)
		clientCount := len(s.Clients)
		s.ClientsMu.Unlock()

		// Remove from user connection tracking
		s.userConnMu.Lock()
		wasInUserConns := false
		if userConns, exists := s.userConnections[client.AccountID]; exists {
			wasInUserConns = userConns[client.id]
			delete(userConns, client.id)
			if len(userConns) == 0 {
				delete(s.userConnections, client.AccountID)
			}
		}
		userConnCount := 0
		if userConns, exists := s.userConnections[client.AccountID]; exists {
			userConnCount = len(userConns)
		}
		s.userConnMu.Unlock()

		// Close connection if not already closed
		client.conn.Close()

		// Close Send channel to signal writer goroutine to exit
		close(client.Send)
		s.recordConnectionClosed(ctx, client.AccountID)

		logs.DebugCtx(ctx, "websocket client disconnected",
			"client_id", client.id,
			"account_id", client.AccountID,
			"session_id", client.SessionID,
			"remaining_clients", clientCount,
			"remaining_user_connections", userConnCount,
			"was_in_clients", wasInClients,
			"was_in_user_conns", wasInUserConns)
	}()

	// Set read deadline to enable timeout detection for stale connections
	// We'll extend it in the loop when messages are received
	client.conn.SetReadDeadline(time.Now().Add(config.PongWait))

	messageCount := 0
	for {
		messageType, msg, err := client.conn.ReadMessage()
		messageCount++
		consolidatedMsgType := peekWSMessageType(msg)

		if !shouldSkipReaderPerMessageDebug(msg, consolidatedMsgType) {
			logs.DebugCtx(ctx, "websocket reader: ReadMessage returned",
				"client_id", client.id,
				"account_id", client.AccountID,
				"message_count", messageCount,
				"has_error", err != nil,
				"error", err,
				"message_type", messageType,
				"message_length", len(msg))
		}
		if err != nil {
			// Check if this is a timeout error (no pong received)
			errStr := err.Error()
			if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "deadline exceeded") {
				// This is likely a pong timeout - connection was idle and didn't respond to pings
				client.activityMu.RLock()
				lastActivity := client.lastActivity
				idleDuration := time.Since(lastActivity)
				client.activityMu.RUnlock()

				logs.WarnCtx(ctx, "websocket read timeout - no pong received (connection likely stale)",
					"client_id", client.id,
					"account_id", client.AccountID,
					"idle_duration", idleDuration,
					"pong_wait", config.PongWait,
					"error", err,
					"note", "This suggests old connections aren't being closed when the client reconnects")
			} else if isBenignWebSocketDisconnect(err) {
				logs.DebugCtx(ctx, "websocket read ended (peer closed or network reset)",
					"client_id", client.id,
					"account_id", client.AccountID,
					"error", err)
			} else {
				logs.WarnCtx(ctx, "websocket read error", "client_id", client.id, "error", err)
			}
			break
		}

		if !shouldSkipReaderPerMessageDebug(msg, consolidatedMsgType) {
			logs.DebugCtx(ctx, "websocket message received",
				"client_id", client.id,
				"message_type", messageType,
				"message_type_name", getMessageTypeName(messageType),
				"message_length", len(msg),
				"message", string(msg),
				"message_bytes", fmt.Sprintf("%x", msg))
		}

		// Update last activity when message is received
		client.activityMu.Lock()
		client.lastActivity = time.Now()
		client.activityMu.Unlock()

		// Extend read deadline for next message/pong
		client.conn.SetReadDeadline(time.Now().Add(config.PongWait))

		// Rate limiting: Check message rate
		client.messageMu.Lock()
		now := time.Now()
		if now.Sub(client.lastReset) > config.MessageRateWindow {
			// Reset counter
			client.messageCount = 0
			client.lastReset = now
		}
		client.messageCount++
		if client.messageCount > config.MessageRateLimit {
			client.messageMu.Unlock()
			logs.WarnCtx(ctx, "websocket message rate limit exceeded",
				"client_id", client.id,
				"account_id", client.AccountID,
				"message_count", client.messageCount,
				"limit", config.MessageRateLimit)
			client.conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "Rate limit exceeded"))
			break
		}
		client.messageMu.Unlock()

		// Handle message based on type
		// First check for plain string "ping" (most common - heartbeat from frontend)
		msgStr := string(msg)
		if msgStr == "ping" {
			// Send pong response through writer goroutine (frontend expects plain string "pong" as returnMessage)
			// Must use Send channel to avoid concurrent writes (gorilla/websocket requires serialized writes)
			select {
			case client.Send <- []byte("pong"):
			default:
				// Send buffer full - log warning but continue (heartbeat failure is not critical)
				logs.WarnCtx(ctx, "websocket heartbeat: failed to queue pong (send buffer full)",
					"client_id", client.id,
					"account_id", client.AccountID)
			}
			client.activityMu.Lock()
			client.lastActivity = time.Now()
			client.activityMu.Unlock()
			continue
		}

		// Parse JSON messages and handle by type field
		if len(msg) > 0 && msg[0] == '{' {
			var msgData map[string]interface{}
			if err := json.Unmarshal(msg, &msgData); err != nil {
				// Not valid JSON
				logs.WarnCtx(ctx, "websocket message is not valid JSON",
					"client_id", client.id,
					"account_id", client.AccountID,
					"error", err,
					"message_preview", msgStr)
				continue
			}

			// Valid JSON - switch on type field
			msgType, ok := msgData["type"].(string)
			if !ok {
				msgType = ""
			}
			if !shouldSkipReaderPerMessageDebug(msg, msgType) {
				logs.DebugCtx(ctx, "parsed message type from JSON",
					"client_id", client.id,
					"account_id", client.AccountID,
					"type", msgType,
					"type_ok", ok)
			}

			switch msgType {
			case "session_resume":
				s.runWSMessageOperation(client, msgType, msg, s.handleSessionResumeWS)
				continue

			case "sync":
				s.runWSMessageOperation(client, msgType, msg, s.handleSyncWS)
				continue

			case "subscribe":
				s.runWSMessageOperation(client, msgType, msg, s.handleSubscribeWS)
				continue

			case "upgrade_scopes":
				s.runWSMessageOperation(client, msgType, msg, s.handleUpgradeScopesWS)
				continue

			case "unsubscribe":
				s.runWSMessageOperation(client, msgType, msg, s.handleUnsubscribeWS)
				continue

			case "document_lock_lock_state_batch":
				s.runWSMessageOperation(client, msgType, msg, s.handleDocumentLockLockStateBatch)
				continue

			case "document_lock_waitlist_pulse":
				s.runWSMessageOperation(client, msgType, msg, s.handleDocumentLockWaitlistPulseWS)
				continue

			case "document_lock_viewer_arrived":
				s.runWSMessageOperation(client, msgType, msg, s.handleDocumentLockViewerArrivedWS)
				continue

			case "document_lock_viewer_departed":
				s.runWSMessageOperation(client, msgType, msg, s.handleDocumentLockViewerDepartedWS)
				continue

			default:
				// Unknown type or no type field
				logs.WarnCtx(ctx, "websocket message with unknown or missing type field",
					"client_id", client.id,
					"account_id", client.AccountID,
					"type", msgType,
					"message_preview", msgStr)
				continue
			}
		} else {
			// Not JSON and not plain string ping
			logs.WarnCtx(ctx, "websocket message is not JSON and not a ping",
				"client_id", client.id,
				"account_id", client.AccountID,
				"message_preview", msgStr)
			continue
		}
	}
}
