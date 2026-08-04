package server

import (
	"context"

	"eve-industry-planner/shared/logs"
)

// contextUntilShutdown is cancelled when shutdownChan closes (or immediately if already closed).
func (s *Server) contextUntilShutdown() (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		select {
		case <-s.shutdownChan:
			cancel()
		case <-ctx.Done():
		}
	}()
	return ctx, cancel
}

// Shutdown closes shutdownChan (coordinators exit) and stops the sync pool.
// Sync-pool wait is bounded by ctx (lifecycle cleanup budget / stop grace).
// Safe to call more than once.
func (s *Server) Shutdown(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	s.shutdownOnce.Do(func() {
		logs.InfoCtx(ctx, "websocket server shutting down")

		close(s.shutdownChan)

		if s.SyncPool != nil {
			stopperSync := s.SyncPool.Stop()
			select {
			case <-stopperSync.Done():
				logs.DebugCtx(ctx, "sync pool stopped")
			case <-ctx.Done():
				logs.WarnCtx(ctx, "sync pool shutdown interrupted", "error", ctx.Err())
			}
		}

		logs.DebugCtx(ctx, "websocket server shutdown complete")
	})
}
