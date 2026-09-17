package server

import (
	"context"
	"hash/fnv"
	"time"

	"eve-industry-planner/shared/logs"
	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/config"
	"eve-industry-planner/websocket/server/natslogic"
	"eve-industry-planner/websocket/server/outgoinglogic"

	"github.com/nats-io/nats.go/jetstream"
)

// docUpdateWork hands a JetStream message to an outbound shard worker so the
// Consume callback returns without waiting for browser fan-out.
type docUpdateWork struct {
	ctx                   context.Context
	msg                   jetstream.Msg
	collectionScopedDocID string
	subject               string
	position              uint64
}

// streamPosition is the message's place in the stream, which every replica reads
// the same and a redelivery repeats. Zero when the message carries no metadata,
// which a client reads as "no position" and applies rather than discards.
func streamPosition(msg jetstream.Msg) uint64 {
	md, err := msg.Metadata()
	if err != nil {
		return 0
	}
	return md.Sequence.Stream
}

// outboundDocPartitionKey groups work by owner so ordering is preserved per owner
// while unrelated owners can be processed on different shard goroutines.
func outboundDocPartitionKey(collectionScopedDocID string, payload []byte) string {
	d, err := outgoinglogic.DecodeOutboundMessage(payload)
	if err != nil {
		return "err:" + collectionScopedDocID
	}
	if !d.Route.Owner.IsZero() {
		return d.Route.Owner.Key()
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

// enqueueOutboundDocUpdate hands a message to its owner's shard FIFO, waiting for
// room rather than going around the queue.
//
// Waiting is what keeps the partition in order, and it cannot deadlock: delivery
// never blocks on a slow client — a full client buffer costs that recipient its
// copy — so a worker always drains. Intake for this shard slows while an owner is
// busy, which is the back-pressure the queue is for.
//
// A wait holds an unacknowledged message, so it renews the ack deadline as it
// goes. Without that, a wait longer than the consumer's AckWait has the server
// redeliver a message this process is still holding, and both copies reach the
// browser.
func (s *Server) enqueueOutboundDocUpdate(ctx context.Context, collectionScopedDocID, subject string, msg jetstream.Msg) {
	position := streamPosition(msg)
	shards := s.docUpdateOutboundShards
	if len(shards) == 0 {
		payloadCopy := append([]byte(nil), msg.Data()...)
		outcome := s.deliverOutboundDocUpdate(ctx, collectionScopedDocID, payloadCopy, position)
		finishReplicaFanoutOperation(ctx, "doc update", collectionScopedDocID, subject, outcome, nil)
		return
	}
	key := outboundDocPartitionKey(collectionScopedDocID, msg.Data())
	idx := shardIndexForDocUpdate(key, len(shards))
	work := docUpdateWork{
		ctx:                   ctx,
		msg:                   msg,
		collectionScopedDocID: collectionScopedDocID,
		subject:               subject,
		position:              position,
	}

	select {
	case shards[idx] <- work:
		// Shard worker delivers and emits the consolidated outcome log.
		return
	default:
	}

	logs.WarnCtx(ctx, "doc update outbound shard queue full; waiting for room",
		"doc_id", collectionScopedDocID,
		"shard", idx,
		"partition", key,
		"shard_queue_cap", config.DocUpdateOutboundShardQueueCap)

	// Counted while parked: a message here has left the stream and is not yet in a
	// shard, so a drain that only looked at the queues and the workers would call
	// itself finished and close the sockets this message is for.
	s.outboundWaitingForRoom.Add(1)
	defer s.outboundWaitingForRoom.Add(-1)

	renew := time.NewTicker(natslogic.DocUpdateAckRenewInterval)
	defer renew.Stop()
	for {
		select {
		case shards[idx] <- work:
			return
		case <-renew.C:
			eipnats.InProgressMessage(ctx, msg)
		case <-ctx.Done():
			// The same answer as a shutdown, for the same reason: what is held here
			// reaches nobody if it is simply dropped.
			s.deliverLateOutboundDocUpdate(ctx, collectionScopedDocID, subject, msg, position)
			return
		case <-s.shutdownChan:
			s.deliverLateOutboundDocUpdate(ctx, collectionScopedDocID, subject, msg, position)
			return
		}
	}
}

// deliverLateOutboundDocUpdate delivers a message that never found room, out of
// its owner's order.
//
// This container's durable is deleted at the start of a drain, and the consumer
// delivers from new, so nothing would redeliver a message given up on here — it
// would simply be lost. Delivering it late to whatever sockets remain is the
// better of the two, and order stops meaning anything once the process is going
// away.
func (s *Server) deliverLateOutboundDocUpdate(ctx context.Context, collectionScopedDocID, subject string, msg jetstream.Msg, position uint64) {
	outcome := s.deliverOutboundDocUpdate(ctx, collectionScopedDocID, append([]byte(nil), msg.Data()...), position)
	finishReplicaFanoutOperation(ctx, "doc update", collectionScopedDocID, subject, outcome, nil)
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
				outcome := s.deliverOutboundDocUpdate(ctx, w.collectionScopedDocID, payload, w.position)
				finishReplicaFanoutOperation(ctx, "doc update", w.collectionScopedDocID, w.subject, outcome, nil)
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
		if s.outboundQueuedCount() == 0 && s.outboundInFlight.Load() == 0 &&
			s.outboundWaitingForRoom.Load() == 0 {
			logs.DebugCtx(ctx, "outbound shard flush complete")
			return
		}
		select {
		case <-ctx.Done():
			logs.WarnCtx(ctx, "outbound shard flush interrupted",
				"error", ctx.Err(),
				"queued", s.outboundQueuedCount(),
				"in_flight", s.outboundInFlight.Load(),
				"waiting_for_room", s.outboundWaitingForRoom.Load())
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
