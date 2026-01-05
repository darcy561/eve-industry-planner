package sync

import (
	"eve-industry-planner/shared/shared/logs"
	"time"
)

const (
	// IterationFallbackDelay is the delay between queue scans when no signals are received
	IterationFallbackDelay = 100 * time.Millisecond
)

// StartSyncCoordinator starts a coordinator goroutine that watches for sync work
// and submits tasks to the sync pool. It processes one sync per client at a time.
func StartSyncCoordinator(s SyncServer, shutdownChan <-chan struct{}, processSyncQueueFn func(clientID string) error) {
	go func() {
		logs.Debug("sync coordinator started")
		defer logs.Debug("sync coordinator stopped")

		for {
			select {
			case <-shutdownChan:
				return

			case clientID := <-s.GetSyncSignals():
				// Client sync queue work
				// Submit task to sync pool
				s.GetSyncPool().SubmitErr(func() error {
					return processSyncQueueFn(clientID)
				})

			case <-time.After(IterationFallbackDelay):
				// Fallback: scan all sync queues for work
				scanSyncQueues(s, processSyncQueueFn)
			}
		}
	}()
}

// scanSyncQueues scans all sync queues for work and submits processing tasks
// One sync per client at a time (enforced by queue and client sync state)
func scanSyncQueues(s SyncServer, processSyncQueueFn func(clientID string) error) {
	s.GetSyncMu().Lock()
	queues := s.GetSyncQueues()
	clientIDs := make([]string, 0, len(queues))
	for clientID, queue := range queues {
		// Check if queue has work (non-blocking read check)
		queue.Mu.RLock()
		hasWork := len(queue.Ch) > 0
		queue.Mu.RUnlock()

		if hasWork {
			clientIDs = append(clientIDs, clientID)
		}
	}
	s.GetSyncMu().Unlock()

	// Submit tasks for queues with work
	for _, clientID := range clientIDs {
		s.GetSyncPool().SubmitErr(func() error {
			return processSyncQueueFn(clientID)
		})
	}
}
