package server

import (
	"context"
	"hash/fnv"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/config"
	"eve-industry-planner/websocket/server/outgoinglogic"

	"github.com/nats-io/nats.go/jetstream"
)

// docUpdateWork hands a JetStream message to an outbound shard worker so the Consume callback
// returns quickly while we still ack only after browser fan-out (or inline fallback).
type docUpdateWork struct {
	ctx                   context.Context
	msg                   jetstream.Msg
	collectionScopedDocID string
	subject               string
}

// outboundDocPartitionKey groups work by account, corporation, or alliance so ordering is
// preserved per scope while unrelated scopes can be processed on different shard goroutines.
func outboundDocPartitionKey(collectionScopedDocID string, payload []byte) string {
	d, err := outgoinglogic.DecodeOutboundMessage(payload)
	if err != nil {
		return "err:" + collectionScopedDocID
	}
	if d.Route.AccountID != "" {
		return "account:" + d.Route.AccountID
	}
	if d.Route.CorporationRef != "" {
		return "corporation:" + d.Route.CorporationRef
	}
	if d.Route.AllianceRef != "" {
		return "alliance:" + d.Route.AllianceRef
	}
	return "explicit:" + collectionScopedDocID
}

func shardIndexForDocUpdate(partitionKey string, shardCount int) int {
	if shardCount < 1 {
		return 0
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(partitionKey))
	return int(h.Sum32() % uint32(shardCount))
}

func (s *Server) finishDocUpdateDelivery(ctx context.Context, docID, subject string, outcome outboundDeliveryOutcome) {
	if outcome.RouteKind == "invalid" {
		detail := outboundDeliveryDetail(docID, subject, outcome)
		eipnats.FinishNATSConsumerOperation(ctx, "warn", "doc update rejected", detail)
		return
	}
	finishReplicaFanoutOperation(ctx, "doc update delivered", docID, subject, outcome, nil)
}

// enqueueOutboundDocUpdate routes to a shard FIFO. If that shard is full, delivers synchronously and acks immediately.
func (s *Server) enqueueOutboundDocUpdate(ctx context.Context, collectionScopedDocID, subject string, msg jetstream.Msg) {
	payloadCopy := append([]byte(nil), msg.Data()...)
	shards := s.docUpdateOutboundShards
	if len(shards) == 0 {
		outcome := s.deliverOutboundDocUpdate(ctx, collectionScopedDocID, payloadCopy)
		s.finishDocUpdateDelivery(ctx, collectionScopedDocID, subject, outcome)
		return
	}
	key := outboundDocPartitionKey(collectionScopedDocID, payloadCopy)
	idx := shardIndexForDocUpdate(key, len(shards))
	select {
	case shards[idx] <- docUpdateWork{
		ctx:                   ctx,
		msg:                   msg,
		collectionScopedDocID: collectionScopedDocID,
		subject:               subject,
	}:
		// Shard worker delivers, acks, and emits the consolidated outcome log.
	default:
		logs.WarnCtx(ctx, "doc update outbound shard queue full; delivering synchronously",
			"doc_id", collectionScopedDocID,
			"shard", idx,
			"partition", key,
			"shard_queue_cap", config.DocUpdateOutboundShardQueueCap)
		outcome := s.deliverOutboundDocUpdate(ctx, collectionScopedDocID, payloadCopy)
		s.finishDocUpdateDelivery(ctx, collectionScopedDocID, subject, outcome)
	}
}

func (s *Server) runDocUpdateOutboundShardWorker(shard int) {
	shards := s.docUpdateOutboundShards
	if shard < 0 || shard >= len(shards) {
		return
	}
	ch := shards[shard]
	for {
		select {
		case <-s.shutdownChan:
			return
		case w, ok := <-ch:
			if !ok {
				return
			}
			s.outboundInFlight.Add(1)
			func() {
				defer s.outboundInFlight.Add(-1)
				ctx := w.ctx
				if ctx == nil {
					ctx = context.Background()
				}
				payload := append([]byte(nil), w.msg.Data()...)
				outcome := s.deliverOutboundDocUpdate(ctx, w.collectionScopedDocID, payload)
				s.finishDocUpdateDelivery(ctx, w.collectionScopedDocID, w.subject, outcome)
			}()
		}
	}
}

func (s *Server) outboundQueuedCount() int {
	n := 0
	for _, ch := range s.docUpdateOutboundShards {
		n += len(ch)
	}
	return n
}

// flushOutboundShards waits until shard FIFOs are empty and no worker is in-flight,
// or ctx is done. Call after intake stop and before kick so sockets can still receive.
func (s *Server) flushOutboundShards(ctx context.Context) {
	if s == nil {
		return
	}
	if ctx == nil {
		ctx = context.Background()
	}
	traceDrainStop("flush")
	if len(s.docUpdateOutboundShards) == 0 {
		return
	}
	t := time.NewTicker(5 * time.Millisecond)
	defer t.Stop()
	for {
		if s.outboundQueuedCount() == 0 && s.outboundInFlight.Load() == 0 {
			logs.DebugCtx(ctx, "outbound shard flush complete")
			return
		}
		select {
		case <-ctx.Done():
			logs.WarnCtx(ctx, "outbound shard flush interrupted",
				"error", ctx.Err(),
				"queued", s.outboundQueuedCount(),
				"in_flight", s.outboundInFlight.Load())
			return
		case <-t.C:
		}
	}
}

func (s *Server) startOutboundDocUpdateShardWorkers() {
	for i := range s.docUpdateOutboundShards {
		go s.runDocUpdateOutboundShardWorker(i)
	}
}
