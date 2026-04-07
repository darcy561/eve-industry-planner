package server

import (
	"context"
	"time"

	"eve-industry-planner/shared/logs"
)

// Shutdown gracefully shuts down the WebSocket server
func (s *Server) Shutdown() {
	shutdownCtx := context.Background()
	logs.InfoCtx(shutdownCtx, "websocket server shutting down")

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
		logs.InfoCtx(shutdownCtx, "incoming pool stopped")
	case <-shutdownTimer.C:
		logs.WarnCtx(shutdownCtx, "incoming pool shutdown timeout")
	}

	select {
	case <-stopperOutgoing.Done():
		logs.InfoCtx(shutdownCtx, "outgoing pool stopped")
	case <-shutdownTimer.C:
		logs.WarnCtx(shutdownCtx, "outgoing pool shutdown timeout")
	}

	logs.InfoCtx(shutdownCtx, "websocket server shutdown complete")
}
