package server

import (
	"errors"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"

	"github.com/gorilla/websocket"
)

var errClientNoConn = errors.New("websocket client has no connection")

// writeFrame serializes a WriteMessage on this client's conn. Gorilla allows only
// one concurrent writer; the writer goroutine, drain kick, and close paths share this.
func (c *Client) writeFrame(messageType int, data []byte, writeWait time.Duration) error {
	if c == nil || c.conn == nil {
		return errClientNoConn
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if writeWait > 0 {
		_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
	}
	return c.conn.WriteMessage(messageType, data)
}

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

	// Create a ticker for sending pings
	pingTicker := time.NewTicker(config.PingPeriod)
	defer func() {
		pingTicker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			if !ok {
				// Channel closed - this is the signal to exit
				// Try to send close message (best effort, may fail if connection already closed)
				_ = c.writeFrame(websocket.CloseMessage, []byte{}, config.WriteWait)
				return
			}

			if err := c.writeFrame(websocket.TextMessage, msg, config.WriteWait); err != nil {
				// Log write error but continue running
				// The writer should only exit when Send channel is closed
				// The reader will detect connection closure and close the Send channel
				logs.WarnCtx(ctx, "websocket write error (continuing)", "client_id", c.id, "error", err)
				// Don't return - continue running and let the Send channel closure signal exit
			}

		case <-pingTicker.C:
			// Send ping to client
			if err := c.writeFrame(websocket.PingMessage, nil, config.WriteWait); err != nil {
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
