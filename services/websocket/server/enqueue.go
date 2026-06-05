package server

import (
	"time"

	"eve-industry-planner/shared/logs"
)

// enqueueIncomingEvent enqueues a client message to the incoming queue for processing.
// This is called when a client sends a message through WebSocket (writes to Mongo).
// Account-scoped realtime does not use per-doc fan-in; no separate "subscribe" to receive.
func (s *Server) enqueueIncomingEvent(event Event) bool {
	ctx := s.clientLogCtx(event.ClientID)
	inQueue := s.getOrCreateIncomingQueue(event.DocID)

	select {
	case inQueue.ch <- event:
		inQueue.lastUse = time.Now()

		select {
		case s.incomingSignals <- event.DocID:
		default:
		}
		return true

	default:
		logs.WarnCtx(ctx, "incoming queue full, dropping message",
			"doc_id", event.DocID,
			"client_id", event.ClientID)
		return false
	}
}
