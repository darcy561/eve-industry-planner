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

	stopperSync := s.SyncPool.Stop()
	shutdownTimeout := 30 * time.Second
	shutdownTimer := time.NewTimer(shutdownTimeout)
	defer shutdownTimer.Stop()

	select {
	case <-stopperSync.Done():
		logs.DebugCtx(shutdownCtx, "sync pool stopped")
	case <-shutdownTimer.C:
		logs.WarnCtx(shutdownCtx, "sync pool shutdown timeout")
	}

	logs.DebugCtx(shutdownCtx, "websocket server shutdown complete")
}
