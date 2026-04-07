package server

import (
	"time"

	"eve-industry-planner/shared/logs"

	"github.com/gorilla/websocket"
)

// writer writes messages to the WebSocket connection
func (s *Server) writer(c *Client) {
	ctx := c.LogContext()
	// Add panic recovery to catch any issues
	defer func() {
		if r := recover(); r != nil {
			logs.ErrorCtx(ctx, "websocket writer goroutine panicked",
				"client_id", c.id,
				"account_id", c.AccountID,
				"panic", r)
		}
	}()

	logs.InfoCtx(ctx, "websocket writer goroutine started",
		"client_id", c.id,
		"account_id", c.AccountID,
		"ping_period", pingPeriod)

	// Create a ticker for sending pings
	pingTicker := time.NewTicker(pingPeriod)
	defer func() {
		pingTicker.Stop()
		c.conn.Close()
		logs.InfoCtx(ctx, "websocket writer goroutine exited",
			"client_id", c.id,
			"account_id", c.AccountID)
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel closed - this is the signal to exit
				// Try to send close message (best effort, may fail if connection already closed)
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Log pong messages being written
			if string(msg) == "pong" {
				logs.InfoCtx(ctx, "websocket writer: writing pong message",
					"client_id", c.id,
					"account_id", c.AccountID)
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				// Log write error but continue running
				// The writer should only exit when Send channel is closed
				// The reader will detect connection closure and close the Send channel
				logs.WarnCtx(ctx, "websocket write error (continuing)", "client_id", c.id, "error", err)
				// Don't return - continue running and let the Send channel closure signal exit
			} else {
				// Log successful pong writes
				if string(msg) == "pong" {
					logs.InfoCtx(ctx, "websocket writer: pong message written successfully",
						"client_id", c.id,
						"account_id", c.AccountID)
				}
			}

		case <-pingTicker.C:
			// Send ping to client
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			// Log heartbeat (ping sent)
			logs.InfoCtx(ctx, "websocket heartbeat: ping sent",
				"client_id", c.id,
				"account_id", c.AccountID,
				"ping_period", pingPeriod)
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				// Check if error is due to connection already closed (expected when client disconnects)
				errStr := err.Error()
				if errStr == "websocket: close sent" || errStr == "websocket: close 1006 (abnormal closure): no close frame received" {
					// Client disconnected - this is expected, log at debug level
					logs.DebugCtx(ctx, "websocket ping failed - client disconnected", "client_id", c.id, "error", err)
				} else {
					// Unexpected error - log as warning but continue running
					// The writer should only exit when Send channel is closed
					logs.WarnCtx(ctx, "websocket ping error (continuing)", "client_id", c.id, "error", err)
				}
				// Don't return - continue running and let the Send channel closure signal exit
				// The reader will close the Send channel when connection is actually closed
			}
		}
	}
}
