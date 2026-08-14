package server

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"
	"eve-industry-planner/websocket/server/natslogic"
)

// reconcileDocUpdateFanoutConsumers allowlists this replica's durables, deletes
// abandoned same-prefix durables (0 waiting pulls, older than grace), deletes
// other naming generations, and stamps InactiveThreshold on kept fan-out durables.
// Call after subscriptions start so this replica has waiting pulls.
func (s *Server) reconcileDocUpdateFanoutConsumers() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.JetStream == nil {
		return
	}

	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.Stack.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.WarnCtx(ctx, "doc fan-out reconcile: get stream", "error", err)
		return
	}

	policy := natscore.DocUpdateFanoutKeepPolicy(
		natslogic.DocFanoutConsumerInactiveThreshold,
		identity.DocLiveUpdatesJetStreamDurable(),
		identity.DocLockJetStreamDurable(),
	)
	if _, err := natscore.ReconcileStreamConsumers(ctx, stream, policy); err != nil {
		logs.WarnCtx(ctx, "doc fan-out reconcile failed", "error", err)
	}
}
