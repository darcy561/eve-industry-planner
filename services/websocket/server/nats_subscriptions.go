package server

import (
	"context"
	"encoding/json"

	"eve-industry-planner/shared/container"
	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/natslogic"

	"github.com/nats-io/nats.go/jetstream"
)

// subscribeToDocUpdates consumes doc.update.* from JetStream (doc-update-stream).
// Each websocket replica uses a unique durable consumer so every replica that hosts
// a tenant can pull that tenant's subjects (FilterSubjects from HostedTenants).
func (s *Server) subscribeToDocUpdates() {
	ctx := context.Background()
	if s.Stack == nil || s.Stack.NATS.JS() == nil {
		logs.WarnCtx(ctx, "JetStream not available, document update subscription disabled")
		return
	}
	stream, err := s.Stack.NATS.DocUpdate.Ensure(ctx)
	if err != nil {
		logs.ErrorCtx(ctx, "doc updates: ensure stream", "error", err)
		return
	}
	s.fanoutFilterMu.Lock()
	s.fanoutStream = stream
	s.fanoutFilterMu.Unlock()

	durable, consumerConfig := natslogic.DocLiveUpdatesConsumerConfig()

	consumer, err := s.Stack.NATS.DocUpdate.Consumer(ctx, consumerConfig)
	if err != nil {
		logs.ErrorCtx(ctx, "doc updates: create consumer", "error", err)
		return
	}

	// Apply current hosted set immediately (usually inert at boot).
	s.reconcileDocFanoutFilters(ctx)

	s.startOutboundDocUpdateShardWorkers()

	processor := func(msg jetstream.Msg) {
		ctx, endSpan := eipnats.BeginConsumerContext(
			context.Background(),
			"eve-industry-planner/websocket/nats",
			"nats.doc_update",
			msg,
			nil,
		)
		defer endSpan()

		subject := msg.Subject()
		docID, err := collectionScopedDocIDFromDocUpdate(msg.Data(), subject)
		if err != nil {
			eipnats.FinishNATSConsumerOperation(ctx, "warn", "doc update rejected", map[string]any{
				"subject": subject,
				"reason":  "bad subject or payload",
				"error":   err.Error(),
			})
			eipnats.AcknowledgeMessage(ctx, msg, "bad subject", eipnats.GetDeliveryCount(msg))
			return
		}

		s.enqueueOutboundDocUpdate(ctx, docID, subject, msg)
	}

	stopChan := make(chan struct{})
	go func() {
		// Intake-only stop: outbound shard workers keep running for flush-before-kick.
		<-s.intakeStopChan
		close(stopChan)
	}()

	if err := eipnats.ConsumeUntil(consumer, "doc.update", processor, stopChan); err != nil {
		return
	}

	logs.DebugCtx(ctx, "subscribed to document updates (JetStream)",
		"consumer", durable,
		"container_id", container.ID())
}

// collectionScopedDocIDFromDocUpdate prefers payload collection+docID so tenant-keyed
// subjects do not break shard keys / logging.
func collectionScopedDocIDFromDocUpdate(payload []byte, subject string) (string, error) {
	var meta struct {
		Collection string `json:"collection"`
		DocID      string `json:"docID"`
	}
	if err := json.Unmarshal(payload, &meta); err == nil {
		if id := eipnats.CollectionScopedDocID(meta.Collection, meta.DocID); id != "" {
			return id, nil
		}
	}
	// Fallback for legacy / non-JSON tests: strip doc.update. prefix only.
	return eipnats.ExtractIDFromSubject(subject, eipnats.SubjectDocUpdate)
}
