package server

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocLockNotifications fans out API-published lock events to all tabs for the account.
func (s *Server) subscribeToDocLockNotifications() {
	ctx := context.Background()
	if s.ServiceClients == nil || s.ServiceClients.JetStream == nil {
		return
	}
	if err := natscore.EnsureDocUpdateStream(s.ServiceClients.JetStream); err != nil {
		logs.ErrorCtx(ctx, "doc lock: ensure stream", "error", err)
		return
	}

	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.ServiceClients.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: get stream", "error", err)
		return
	}

	docLockDurable, consumerConfig := natslogic.DocLockConsumerConfig()

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "doc lock: create consumer", "error", err)
		return
	}

	processor := func(msg jetstream.Msg) {
		subject := msg.Subject()
		accountID, err := natscore.ExtractIDFromSubject(subject, natscore.SubjectDocLock)
		if err != nil {
			logs.WarnCtx(ctx, "doc lock: bad subject", "subject", subject, "error", err)
			natscore.AcknowledgeMessage(msg, "bad subject", natscore.GetDeliveryCount(msg))
			return
		}

		wire, err := natslogic.BuildDocumentLockWire(msg.Data())
		if err != nil {
			logs.WarnCtx(ctx, "doc lock: build wire payload failed", "error", err)
			natscore.AcknowledgeMessage(msg, "marshal fail", natscore.GetDeliveryCount(msg))
			return
		}

		s.broadcastRawToAccount(accountID, wire)

		deliveryCount := natscore.GetDeliveryCount(msg)
		natscore.AcknowledgeMessage(msg, "doc lock delivered", deliveryCount)
	}

	stopChan := make(chan struct{})
	go func() {
		<-s.shutdownChan
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
		"replica_suffix", identity.JetStreamConsumerSuffix())
}
