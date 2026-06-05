package server

import (
	"context"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/identity"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocUpdates consumes doc.update.* from JetStream (doc-update-stream).
// Each websocket replica uses a unique durable consumer so every replica receives every message
// (unlike a shared durable, which load-balances across instances).
func (s *Server) subscribeToDocUpdates() {
	ctx := context.Background()
	if s.ServiceClients == nil || s.ServiceClients.JetStream == nil {
		logs.WarnCtx(ctx, "JetStream not available, document update subscription disabled")
		return
	}
	if err := natscore.EnsureDocUpdateStream(s.ServiceClients.JetStream); err != nil {
		logs.ErrorCtx(ctx, "doc updates: ensure stream", "error", err)
		return
	}

	stream, err := natscore.GetOrEnsureStream(
		ctx,
		s.ServiceClients.JetStream,
		natscore.EnsureDocUpdateStream,
		natscore.DocUpdateStream,
	)
	if err != nil {
		logs.ErrorCtx(ctx, "doc updates: get stream", "error", err)
		return
	}

	durable, consumerConfig := natslogic.DocLiveUpdatesConsumerConfig()

	consumer, err := natscore.GetOrCreateConsumer(ctx, stream, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "doc updates: create consumer", "error", err)
		return
	}

	s.startOutboundDocUpdateShardWorkers()

	processor := func(msg jetstream.Msg) {
		ctx, endSpan := natscore.BeginConsumerContext(
			context.Background(),
			"eve-industry-planner/websocket/nats",
			"nats.doc_update",
			msg,
			nil,
		)
		defer endSpan()

		subject := msg.Subject()
		docID, err := natscore.ExtractIDFromSubject(subject, natscore.SubjectDocUpdate)
		if err != nil {
			natscore.FinishNATSConsumerOperation(ctx, "warn", "doc update rejected", map[string]interface{}{
				"subject": subject,
				"reason":  "bad subject",
				"error":   err.Error(),
			})
			natscore.AcknowledgeMessage(msg, "bad subject", natscore.GetDeliveryCount(msg))
			return
		}

		s.enqueueOutboundDocUpdate(ctx, docID, subject, msg)
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
		"doc.update.>",
	)

	logs.DebugCtx(ctx, "subscribed to document updates (JetStream)",
		"consumer", durable,
		"replica_suffix", identity.JetStreamConsumerSuffix())
}
