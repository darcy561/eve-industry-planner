package server

import (
	"context"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocLockNotifications fans out API-published lock events to all tabs for the account.
func (s *Server) subscribeToDocLockNotifications() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS.JS() == nil {
		return
	}
	stream, err := s.Stack.NATS.DocUpdate.Ensure(ctx)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: ensure stream", "error", err)
		return
	}
	s.fanoutFilterMu.Lock()
	s.fanoutStream = stream
	s.fanoutFilterMu.Unlock()

	docLockDurable, consumerConfig := natslogic.DocLockConsumerConfig()

	processor := eipnats.Handle("eve-industry-planner/websocket/nats", "nats.doc_lock_notification",
		func(ctx context.Context, msg jetstream.Msg) error {
			subject := msg.Subject()
			accountID, err := eipnats.ExtractIDFromSubject(subject, eipnats.SubjectDocLock)
			if err != nil {
				return eipnats.Terminate("bad subject %s: %v", subject, err)
			}
			wire, suppressSessionID, err := natslogic.BuildDocumentLockWire(msg.Data())
			if err != nil {
				return eipnats.Terminate("unreadable lock payload on %s: %v", subject, err)
			}

			outcome := s.broadcastRawToAccount("doc_lock", accountID, wire, suppressSessionID)
			// Reports recipients, suppression and an idle replica, which the
			// generic outcome cannot express; the wrapper leaves it as the one
			// outcome for this message.
			finishReplicaFanoutOperation(ctx, "doc lock notification delivered", "", subject, outcome, nil)
			return nil
		})

	if _, err := s.Stack.NATS.DocUpdate.Subscribe(ctx, consumerConfig, processor,
		eipnats.WithStopChannel(s.intakeStopChan)); err != nil {
		logs.ErrorCtx(ctx, "doc lock: subscribe", "error", err)
		return
	}

	s.reconcileDocFanoutFilters(ctx)

	logs.DebugCtx(ctx, "subscribed to doc.lock notifications",
		"consumer", docLockDurable,
		"container_id", container.ID())
}
