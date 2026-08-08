package server

import (
	"context"

	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocLockNotifications fans out API-published lock events to all tabs for the account.
func (s *Server) subscribeToDocLockNotifications() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.JetStream == nil {
		return
	}
	if err := natscore.EnsureDocUpdateStream(s.Stack.JetStream); err != nil {
		logs.ErrorCtx(ctx, "doc lock: ensure stream", "error", err)
		return
	}

	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.Stack.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: get stream", "error", err)
		return
	}
	s.fanoutFilterMu.Lock()
	s.fanoutStream = stream
	s.fanoutFilterMu.Unlock()

	docLockDurable, consumerConfig := natslogic.DocLockConsumerConfig()

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: create consumer", "error", err)
		return
	}
	s.reconcileDocFanoutFilters(ctx)

	processor := func(msg jetstream.Msg) {
		ctx, endSpan := natscore.BeginConsumerContext(
			context.Background(),
			"eve-industry-planner/websocket/nats",
			"nats.doc_lock_notification",
			msg,
			nil,
		)
		defer endSpan()

		subject := msg.Subject()
		accountID, err := natscore.ExtractIDFromSubject(subject, natscore.SubjectDocLock)
		if err != nil {
			natscore.FinishNATSConsumerOperation(ctx, "warn", "doc lock notification rejected", map[string]any{
				"subject": subject,
				"reason":  "bad subject",
				"error":   err.Error(),
			})
			natscore.AcknowledgeMessage(msg, "bad subject", natscore.GetDeliveryCount(msg))
			return
		}

		wire, suppressSessionID, err := natslogic.BuildDocumentLockWire(msg.Data())
		if err != nil {
			natscore.FinishNATSConsumerOperation(ctx, "warn", "doc lock notification rejected", map[string]any{
				"subject":    subject,
				"account_id": accountID,
				"reason":     "marshal fail",
				"error":      err.Error(),
			})
			natscore.AcknowledgeMessage(msg, "marshal fail", natscore.GetDeliveryCount(msg))
			return
		}

		outcome := s.broadcastRawToAccount(accountID, wire, suppressSessionID)

		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "doc lock delivered", deliveryCount)
		finishReplicaFanoutOperation(ctx, "doc lock notification delivered", "", subject, outcome, nil)
	}

	stopChan := make(chan struct{})
	go func() {
		<-s.intakeStopChan
		close(stopChan)
	}()

	natscore.StartMessageProcessingLoop(
		consumer,
		processor,
		stopChan,
		"doc.lock.>",
	)

	logs.DebugCtx(ctx, "subscribed to doc.lock notifications",
		"consumer", docLockDurable,
		"container_id", container.ID())
}
