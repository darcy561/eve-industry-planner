package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

// enqueueIncomingEvent enqueues a client message to the incoming queue for processing
// This is called when a client sends a message through WebSocket
func (s *Server) enqueueIncomingEvent(event Event) {
	ctx := s.clientLogCtx(event.ClientID)
	// Get or create incoming queue for this document
	inQueue := s.getOrCreateIncomingQueue(event.DocID)

	// Enqueue event (non-blocking)
	select {
	case inQueue.ch <- event:
		inQueue.lastUse = time.Now()

		// Signal coordinator that work is available
		select {
		case s.incomingSignals <- event.DocID:
			// Signal sent successfully
		default:
			// Signal channel full - coordinator will find work via scan anyway
			logs.DebugCtx(ctx, "incoming signal channel full, will be picked up by scan",
				"doc_id", event.DocID)
		}

		logs.DebugCtx(ctx, "incoming event enqueued",
			"doc_id", event.DocID,
			"client_id", event.ClientID)

	default:
		// Queue full - drop message
		logs.WarnCtx(ctx, "incoming queue full, dropping message",
			"doc_id", event.DocID,
			"client_id", event.ClientID)
	}

	// Subscribe client to outgoing queue (for receiving updates)
	outQueue := s.getOrCreateOutgoingQueue(event.DocID)

	outQueue.mu.Lock()
	outQueue.subscribers[event.ClientID] = true
	outQueue.mu.Unlock()

	// Track subscription in client
	s.ClientsMu.RLock()
	client := s.Clients[event.ClientID]
	s.ClientsMu.RUnlock()

	if client != nil {
		client.subscribedDocs[event.DocID] = true
	}
}

// enqueueOutgoingEvent enqueues a NATS update to the outgoing queue for broadcasting
// This is called when a document update is received via NATS
// The queue worker will extract sourceClientID and other metadata from the message
func (s *Server) enqueueOutgoingEvent(docID string, messageData []byte) {
	ctx := context.Background()
	// Get or create outgoing queue for this document
	outQueue := s.getOrCreateOutgoingQueue(docID)

	// Create event from NATS message
	// Metadata (sourceClientID, operationType, accountID) will be extracted by queue worker
	// ClientID is not set for outgoing events (zero value is fine)
	event := Event{
		DocID: docID,
		Msg:   messageData,
	}

	// Enqueue event (non-blocking)
	select {
	case outQueue.ch <- event:
		outQueue.lastUse = time.Now()

		// Signal coordinator that work is available
		select {
		case s.outgoingSignals <- docID:
			// Signal sent successfully
		default:
			// Signal channel full - coordinator will find work via scan anyway
			logs.DebugCtx(ctx, "outgoing signal channel full, will be picked up by scan",
				"doc_id", docID)
		}

		logs.DebugCtx(ctx, "outgoing event enqueued from NATS",
			"doc_id", docID)

	default:
		// Queue full - drop message
		logs.WarnCtx(ctx, "outgoing queue full, dropping NATS update",
			"doc_id", docID)
	}
}
