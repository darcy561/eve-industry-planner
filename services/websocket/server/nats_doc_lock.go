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

	consumer, err := s.Stack.NATS.DocUpdate.Consumer(ctx, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: create consumer", "error", err)
		return
	}
	s.reconcileDocFanoutFilters(ctx)

	processor := func(msg jetstream.Msg) {
		ctx, endSpan := eipnats.BeginConsumerContext(
			context.Background(),
			"eve-industry-planner/websocket/nats",
			"nats.doc_lock_notification",
			msg,
			nil,
		)
		defer endSpan()

		subject := msg.Subject()
		accountID, err := eipnats.ExtractIDFromSubject(subject, eipnats.SubjectDocLock)
		if err != nil {
			eipnats.FinishNATSConsumerOperation(ctx, "warn", "doc lock notification rejected", map[string]any{
				"subject": subject,
				"reason":  "bad subject",
				"error":   err.Error(),
			})
			eipnats.AcknowledgeMessage(ctx, msg, "bad subject", eipnats.GetDeliveryCount(msg))
			return
		}

		wire, suppressSessionID, err := natslogic.BuildDocumentLockWire(msg.Data())
		if err != nil {
			eipnats.FinishNATSConsumerOperation(ctx, "warn", "doc lock notification rejected", map[string]any{
				"subject":    subject,
				"account_id": accountID,
				"reason":     "marshal fail",
				"error":      err.Error(),
			})
			eipnats.AcknowledgeMessage(ctx, msg, "marshal fail", eipnats.GetDeliveryCount(msg))
			return
		}

		outcome := s.broadcastRawToAccount(accountID, wire, suppressSessionID)

		deliveryCount := eipnats.GetDeliveryCount(msg)
		eipnats.AcknowledgeMessage(ctx, msg, "doc lock delivered", deliveryCount)
		finishReplicaFanoutOperation(ctx, "doc lock notification delivered", "", subject, outcome, nil)
	}

	stopChan := make(chan struct{})
	go func() {
		<-s.intakeStopChan
		close(stopChan)
	}()

	if err := eipnats.ConsumeUntil(consumer, "doc.lock.>", processor, stopChan); err != nil {
		return
	}

	logs.DebugCtx(ctx, "subscribed to doc.lock notifications",
		"consumer", docLockDurable,
		"container_id", container.ID())
}
