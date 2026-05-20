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
