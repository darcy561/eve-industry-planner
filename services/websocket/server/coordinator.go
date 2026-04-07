package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

// startIncomingCoordinator starts a coordinator goroutine that watches for incoming work
// and submits tasks to the incoming pond pool
func (s *Server) startIncomingCoordinator() {
	go func() {
		coordCtx := context.Background()
		logs.DebugCtx(coordCtx, "incoming coordinator started")
		defer logs.DebugCtx(coordCtx, "incoming coordinator stopped")

		for {
			select {
			case <-s.shutdownChan:
				return

			case docID := <-s.incomingSignals:
				// Document queue work
				s.incomingPool.SubmitErr(func() error {
					return s.processIncomingQueue(docID)
				})

			case <-s.incomingBulkSignals:
				// Incoming bulk queue work
				s.incomingPool.SubmitErr(func() error {
					return s.processIncomingBulkQueue()
				})

			case <-time.After(IterationFallbackDelay):
				// Fallback: scan all queues for work
				s.scanIncomingBulkQueue()
				s.scanIncomingQueues()
			}
		}
	}()
}

// startOutgoingCoordinator starts a coordinator goroutine that watches for outgoing work
// and submits tasks to the outgoing pond pool
func (s *Server) startOutgoingCoordinator() {
	go func() {
		coordCtx := context.Background()
		logs.DebugCtx(coordCtx, "outgoing coordinator started")
		defer logs.DebugCtx(coordCtx, "outgoing coordinator stopped")

		for {
			select {
			case <-s.shutdownChan:
				return

			case docID := <-s.outgoingSignals:
				// Submit task to outgoing pool
				s.outgoingPool.SubmitErr(func() error {
					return s.processOutgoingQueue(docID)
				})

			case <-time.After(IterationFallbackDelay):
				// Fallback: scan all queues for work
				s.scanOutgoingQueues()
			}
		}
	}()
}

// scanIncomingQueues scans all incoming queues for work and submits processing tasks
func (s *Server) scanIncomingQueues() {
	s.incomingMu.RLock()
	docIDs := make([]string, 0, len(s.incomingQueues))
	for docID, queue := range s.incomingQueues {
		// Check if queue has work (non-blocking read check)
		queue.mu.RLock()
		hasWork := len(queue.ch) > 0
		queue.mu.RUnlock()

		if hasWork {
			docIDs = append(docIDs, docID)
		}
	}
	s.incomingMu.RUnlock()

	// Submit tasks for queues with work
	for _, docID := range docIDs {
		s.incomingPool.SubmitErr(func() error {
			return s.processIncomingQueue(docID)
		})
	}
}

// scanOutgoingQueues scans all outgoing queues for work and submits processing tasks
func (s *Server) scanOutgoingQueues() {
	s.outgoingMu.RLock()
	docIDs := make([]string, 0, len(s.outgoingQueues))
	for docID, queue := range s.outgoingQueues {
		// Check if queue has work (non-blocking read check)
		queue.mu.RLock()
		hasWork := len(queue.ch) > 0
		queue.mu.RUnlock()

		if hasWork {
			docIDs = append(docIDs, docID)
		}
	}
	s.outgoingMu.RUnlock()

	// Submit tasks for queues with work
	for _, docID := range docIDs {
		s.outgoingPool.SubmitErr(func() error {
			return s.processOutgoingQueue(docID)
		})
	}
}
