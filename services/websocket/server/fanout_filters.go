package server

import (
	"context"
	"time"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"

	"github.com/nats-io/nats.go/jetstream"
)

// docFanoutFilterDebounce coalesces connect/disconnect/scope storms before UpdateConsumer.
const docFanoutFilterDebounce = 100 * time.Millisecond

// scheduleDocFanoutFilterReconcile queues a debounced FilterSubjects update from HostedTenants.
func (s *Server) scheduleDocFanoutFilterReconcile() {
	if s == nil || s.Stack == nil || s.Stack.JetStream == nil {
		return
	}
	s.fanoutFilterMu.Lock()
	defer s.fanoutFilterMu.Unlock()
	if s.fanoutFilterTimer != nil {
		s.fanoutFilterTimer.Stop()
	}
	s.fanoutFilterTimer = time.AfterFunc(docFanoutFilterDebounce, func() {
		s.reconcileDocFanoutFilters(context.Background())
	})
}

// reconcileDocFanoutFilters applies HostedTenants → FilterSubjects for both fan-out durables.
func (s *Server) reconcileDocFanoutFilters(ctx context.Context) {
	if s == nil || s.Stack == nil || s.Stack.JetStream == nil {
		return
	}
	stream, err := s.docFanoutStream(ctx)
	if err != nil {
		logs.WarnCtx(ctx, "doc fanout filters: get stream", "error", err)
		return
	}
	tenants := s.HostedTenants()
	updateFilters := natscore.DocUpdateFiltersForHostedTenants(tenants)
	lockFilters := natscore.DocLockFiltersForHostedTenants(tenants)

	liveDurable := identity.DocLiveUpdatesJetStreamDurable()
	lockDurable := identity.DocLockJetStreamDurable()

	if err := natscore.UpdateConsumerFilterSubjects(ctx, stream, liveDurable, updateFilters); err != nil {
		logs.WarnCtx(ctx, "doc fanout filters: update live consumer",
			"consumer", liveDurable, "filters", updateFilters, "error", err)
	}
	if err := natscore.UpdateConsumerFilterSubjects(ctx, stream, lockDurable, lockFilters); err != nil {
		logs.WarnCtx(ctx, "doc fanout filters: update lock consumer",
			"consumer", lockDurable, "filters", lockFilters, "error", err)
	}
}

func (s *Server) docFanoutStream(ctx context.Context) (jetstream.Stream, error) {
	s.fanoutFilterMu.Lock()
	cached := s.fanoutStream
	s.fanoutFilterMu.Unlock()
	if cached != nil {
		return cached, nil
	}
	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.Stack.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		return nil, err
	}
	s.fanoutFilterMu.Lock()
	s.fanoutStream = stream
	s.fanoutFilterMu.Unlock()
	return stream, nil
}

// stopDocFanoutFilterReconcile cancels a pending debounced update (shutdown).
func (s *Server) stopDocFanoutFilterReconcile() {
	s.fanoutFilterMu.Lock()
	defer s.fanoutFilterMu.Unlock()
	if s.fanoutFilterTimer != nil {
		s.fanoutFilterTimer.Stop()
		s.fanoutFilterTimer = nil
	}
}
