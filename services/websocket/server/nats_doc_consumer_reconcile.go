package server

import (
	"context"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/identity"
	"eve-industry-planner/websocket/server/natslogic"
)

// reconcileDocUpdateFanoutConsumers allowlists this replica's durables, deletes
// abandoned same-prefix durables (0 waiting pulls, older than grace), deletes
// other naming generations, and stamps InactiveThreshold on kept fan-out durables.
// Call after subscriptions start so this replica has waiting pulls.
func (s *Server) reconcileDocUpdateFanoutConsumers() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS.JS() == nil {
		return
	}

	stream, err := eipnats.GetOrEnsureStream(
		ctx,
		s.Stack.NATS.JS(),
		eipnats.EnsureDocUpdateStream,
		eipnats.DocUpdateStream,
	)
	if err != nil {
		logs.WarnCtx(ctx, "doc fan-out reconcile: get stream", "error", err)
		return
	}

	policy := eipnats.DocUpdateFanoutKeepPolicy(
		natslogic.DocFanoutConsumerInactiveThreshold,
		identity.DocLiveUpdatesJetStreamDurable(),
		identity.DocLockJetStreamDurable(),
	)
	if _, err := eipnats.ReconcileStreamConsumers(ctx, stream, policy); err != nil {
		logs.WarnCtx(ctx, "doc fan-out reconcile failed", "error", err)
	}
}
