package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"
)

// reconcileDocUpdateFanoutConsumers keeps this replica's durables and its peers,
// deletes fan-out durables of an older naming generation, and stamps
// InactiveThreshold on what it keeps.
func (s *Server) reconcileDocUpdateFanoutConsumers() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS.JS() == nil {
		return
	}

	if _, err := s.Stack.NATS.DocUpdate.Reconcile(
		ctx,
		identity.DocLiveUpdatesJetStreamDurable(),
		identity.DocLockJetStreamDurable(),
	); err != nil {
		logs.WarnCtx(ctx, "doc fan-out reconcile failed", "error", err)
	}
}
