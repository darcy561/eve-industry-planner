package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"
)

// getOrCreateIncomingQueue retrieves an existing incoming queue for a document,
// or creates a new one if it doesn't exist. Thread-safe.
func (s *Server) getOrCreateIncomingQueue(docID string) *IncomingDocQueue {
	ctx := context.Background()
	s.incomingMu.Lock()
	defer s.incomingMu.Unlock()

	dq, exists := s.incomingQueues[docID]
	if exists {
		dq.lastUse = time.Now()
		return dq
	}

	dq = &IncomingDocQueue{
		ch:      make(chan Event, config.QueueBufferSize),
		lastUse: time.Now(),
	}
	s.incomingQueues[docID] = dq

	logs.DebugCtx(ctx, "created incoming queue", "doc_id", docID)
	return dq
}

// getIncomingQueue retrieves an incoming queue without creating it.
// Returns nil if the queue doesn't exist. Thread-safe read.
func (s *Server) getIncomingQueue(docID string) *IncomingDocQueue {
	s.incomingMu.RLock()
	defer s.incomingMu.RUnlock()

	return s.incomingQueues[docID]
}

// deleteIncomingQueue removes an incoming queue. Thread-safe.
// Caller should ensure the queue is empty and not in use.
func (s *Server) deleteIncomingQueue(docID string) {
	ctx := context.Background()
	s.incomingMu.Lock()
	defer s.incomingMu.Unlock()

	dq, exists := s.incomingQueues[docID]
	if !exists {
		return
	}

	close(dq.ch)
	delete(s.incomingQueues, docID)

	logs.DebugCtx(ctx, "deleted incoming queue", "doc_id", docID)
}
