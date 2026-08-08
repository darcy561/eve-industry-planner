package server

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"
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

// drainStopTrace, when non-nil, records intake-stop steps (tests only).
var drainStopTrace func(step string)

func traceDrainStop(step string) {
	if drainStopTrace != nil {
		drainStopTrace(step)
	}
}

// stopIntakeOnly closes intakeStopChan so JetStream pull loops exit without
// stopping outbound shard workers (needed so DrainForRoll can flush FIFOs).
func (s *Server) stopIntakeOnly() {
	if s == nil || s.intakeStopChan == nil {
		return
	}
	s.intakeStopOnce.Do(func() {
		traceDrainStop("intake_stop")
		s.stopDocFanoutFilterReconcile()
		close(s.intakeStopChan)
	})
}

// stopConsumeLoops stops intake (if not already) and closes shutdownChan so shard
// workers and background coordinators exit. Safe with nil channels (unit tests). Idempotent.
func (s *Server) stopConsumeLoops() {
	if s == nil {
		return
	}
	s.stopIntakeOnly()
	if s.shutdownChan == nil {
		return
	}
	s.stopConsumeOnce.Do(func() {
		traceDrainStop("stop")
		close(s.shutdownChan)
	})
}

// deleteOwnDocFanoutConsumers removes this container's doc.update / doc.lock durables.
// Best-effort: requires a live JetStream client (call before stackservices NATS cleanup).
func (s *Server) deleteOwnDocFanoutConsumers(ctx context.Context) {
	traceDrainStop("delete")
	if s == nil || s.Stack == nil || s.Stack.JetStream == nil {
		return
	}
	stream, err := s.Stack.JetStream.Stream(ctx, natscore.DocUpdateStream)
	if err != nil {
		logs.WarnCtx(ctx, "doc fan-out durable delete: get stream failed", "error", err)
		return
	}
	live := identity.DocLiveUpdatesJetStreamDurable()
	lock := identity.DocLockJetStreamDurable()
	ok := natscore.DeleteConsumers(ctx, stream, live, lock)
	logs.InfoCtx(ctx, "deleted own doc fan-out durables",
		"ok", ok, "live", live, "lock", lock)
}

// Shutdown stops consume loops (if not already) and waits on the sync pool.
// On the normal process-stop path DrainForRoll already deleted durables, flushed
// outbound, kicked clients, and stopped pulls; this still best-effort deletes
// (not-found OK) for Shutdown-without-drain. Sync-pool wait is bounded by ctx.
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

		s.deleteOwnDocFanoutConsumers(ctx)
		s.stopConsumeLoops()

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
