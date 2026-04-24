package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"
)

// startIncomingCoordinator starts a coordinator goroutine that watches for incoming work.
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
				go func(id string) { _ = s.processIncomingQueue(id) }(docID)

			case <-time.After(config.IterationFallbackDelay):
				s.scanIncomingQueues()
			}
		}
	}()
}

// scanIncomingQueues scans all incoming queues for work and submits processing tasks
func (s *Server) scanIncomingQueues() {
	s.incomingMu.RLock()
	docIDs := make([]string, 0, len(s.incomingQueues))
	for docID, queue := range s.incomingQueues {
		queue.mu.RLock()
		hasWork := len(queue.ch) > 0
		queue.mu.RUnlock()

		if hasWork {
			docIDs = append(docIDs, docID)
		}
	}
	s.incomingMu.RUnlock()

	for _, docID := range docIDs {
		go func(id string) { _ = s.processIncomingQueue(id) }(docID)
	}
}
