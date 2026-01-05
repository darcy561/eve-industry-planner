package server

import (
	"eve-industry-planner/shared/shared/logs"
	"time"
)

// getOrCreateIncomingQueue retrieves an existing incoming queue for a document,
// or creates a new one if it doesn't exist. Thread-safe.
func (s *Server) getOrCreateIncomingQueue(docID string) *IncomingDocQueue {
	s.incomingMu.Lock()
	defer s.incomingMu.Unlock()

	// Check if queue already exists
	dq, exists := s.incomingQueues[docID]
	if exists {
		// Update last use time
		dq.lastUse = time.Now()
		return dq
	}

	// Create new incoming queue
	dq = &IncomingDocQueue{
		ch:      make(chan Event, QueueBufferSize),
		lastUse: time.Now(),
	}
	s.incomingQueues[docID] = dq

	logs.Debug("created incoming queue", "doc_id", docID)
	return dq
}

// getOrCreateOutgoingQueue retrieves an existing outgoing queue for a document,
// or creates a new one if it doesn't exist. Thread-safe.
func (s *Server) getOrCreateOutgoingQueue(docID string) *OutgoingDocQueue {
	logs.Info("getOrCreateOutgoingQueue: attempting to acquire lock", "doc_id", docID)
	s.outgoingMu.Lock()
	logs.Info("getOrCreateOutgoingQueue: lock acquired", "doc_id", docID)
	defer func() {
		logs.Info("getOrCreateOutgoingQueue: releasing lock", "doc_id", docID)
		s.outgoingMu.Unlock()
	}()

	// Check if queue already exists
	dq, exists := s.outgoingQueues[docID]
	if exists {
		// Update last use time
		dq.lastUse = time.Now()
		logs.Info("getOrCreateOutgoingQueue: queue exists", "doc_id", docID)
		return dq
	}

	// Create new outgoing queue
	logs.Info("getOrCreateOutgoingQueue: creating new queue", "doc_id", docID)
	dq = &OutgoingDocQueue{
		ch:          make(chan Event, QueueBufferSize),
		subscribers: make(map[string]bool),
		lastUse:     time.Now(),
	}
	s.outgoingQueues[docID] = dq

	logs.Info("created outgoing queue", "doc_id", docID)
	return dq
}

// getIncomingQueue retrieves an incoming queue without creating it.
// Returns nil if the queue doesn't exist. Thread-safe read.
func (s *Server) getIncomingQueue(docID string) *IncomingDocQueue {
	s.incomingMu.RLock()
	defer s.incomingMu.RUnlock()

	return s.incomingQueues[docID]
}

// getOutgoingQueue retrieves an outgoing queue without creating it.
// Returns nil if the queue doesn't exist. Thread-safe read.
func (s *Server) getOutgoingQueue(docID string) *OutgoingDocQueue {
	s.outgoingMu.RLock()
	defer s.outgoingMu.RUnlock()

	return s.outgoingQueues[docID]
}

// deleteIncomingQueue removes an incoming queue. Thread-safe.
// Caller should ensure the queue is empty and not in use.
func (s *Server) deleteIncomingQueue(docID string) {
	s.incomingMu.Lock()
	defer s.incomingMu.Unlock()

	dq, exists := s.incomingQueues[docID]
	if !exists {
		return
	}

	// Close channel and remove from map
	close(dq.ch)
	delete(s.incomingQueues, docID)

	logs.Debug("deleted incoming queue", "doc_id", docID)
}

// deleteOutgoingQueue removes an outgoing queue. Thread-safe.
// Caller should ensure the queue is empty and not in use.
func (s *Server) deleteOutgoingQueue(docID string) {
	s.outgoingMu.Lock()
	defer s.outgoingMu.Unlock()

	dq, exists := s.outgoingQueues[docID]
	if !exists {
		return
	}

	// Close channel and remove from map
	close(dq.ch)
	delete(s.outgoingQueues, docID)

	logs.Debug("deleted outgoing queue", "doc_id", docID)
}
