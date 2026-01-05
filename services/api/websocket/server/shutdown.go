package server

import (
	"eve-industry-planner/shared/shared/logs"
	"time"
)

// Shutdown gracefully shuts down the WebSocket server
func (s *Server) Shutdown() {
	logs.Info("websocket server shutting down")

	// Signal shutdown to all coordinators
	close(s.shutdownChan)

	// Stop pools and get done channels
	stopperIncoming := s.incomingPool.Stop()
	stopperOutgoing := s.outgoingPool.Stop()

	// Wait for pools to finish (with timeout)
	shutdownTimeout := 30 * time.Second
	shutdownTimer := time.NewTimer(shutdownTimeout)
	defer shutdownTimer.Stop()

	select {
	case <-stopperIncoming.Done():
		logs.Info("incoming pool stopped")
	case <-shutdownTimer.C:
		logs.Warn("incoming pool shutdown timeout")
	}

	select {
	case <-stopperOutgoing.Done():
		logs.Info("outgoing pool stopped")
	case <-shutdownTimer.C:
		logs.Warn("outgoing pool shutdown timeout")
	}

	logs.Info("websocket server shutdown complete")
}
