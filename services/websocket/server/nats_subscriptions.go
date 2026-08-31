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

	s.startOutboundDocUpdateShardWorkers()

	processor := eipnats.Handle("eve-industry-planner/websocket/nats", "nats.doc_update",
		func(ctx context.Context, msg jetstream.Msg) error {
			subject := msg.Subject()
			docID, err := collectionScopedDocIDFromDocUpdate(msg.Data(), subject)
			if err != nil {
				return eipnats.Terminate("bad subject or payload on %s: %v", subject, err)
			}
			// Handing the message to a shard worker is the point it has been
			// received: the queue is in-process, so nothing is gained by holding
			// the acknowledgement until delivery.
			s.enqueueOutboundDocUpdate(ctx, docID, subject, msg)
			return nil
		})

	// Intake-only stop: outbound shard workers keep running for flush-before-kick.
	if _, err := s.Stack.NATS.DocUpdate.Subscribe(ctx, consumerConfig, processor,
		eipnats.WithStopChannel(s.intakeStopChan)); err != nil {
		logs.ErrorCtx(ctx, "doc updates: subscribe", "error", err)
		return
	}

	// Apply current hosted set immediately (usually inert at boot).
	s.reconcileDocFanoutFilters(ctx)

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
