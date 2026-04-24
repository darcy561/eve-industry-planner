package server

import (
	"context"
	"hash/fnv"

	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/websocket/server/config"
	"eve-industry-planner/websocket/server/outgoinglogic"

	"github.com/nats-io/nats.go/jetstream"
)

// docUpdateWork hands a JetStream message to an outbound shard worker so the Consume callback
// returns quickly while we still ack only after browser fan-out (or inline fallback).
type docUpdateWork struct {
	msg                   jetstream.Msg
	collectionScopedDocID string
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
	if d.Route.CorporationID != "" {
		return "corporation:" + d.Route.CorporationID
	}
	if d.Route.AllianceID != "" {
		return "alliance:" + d.Route.AllianceID
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

// enqueueOutboundDocUpdate routes to a shard FIFO. If that shard is full, delivers synchronously and acks immediately.
func (s *Server) enqueueOutboundDocUpdate(collectionScopedDocID string, msg jetstream.Msg) {
	payloadCopy := append([]byte(nil), msg.Data()...)
	shards := s.docUpdateOutboundShards
	if len(shards) == 0 {
		s.deliverOutboundDocUpdate(collectionScopedDocID, payloadCopy)
		natscore.AcknowledgeMessage(msg, "no_shards", natscore.GetDeliveryCount(msg))
		return
	}
	key := outboundDocPartitionKey(collectionScopedDocID, payloadCopy)
	idx := shardIndexForDocUpdate(key, len(shards))
	select {
	case shards[idx] <- docUpdateWork{msg: msg, collectionScopedDocID: collectionScopedDocID}:
		// Shard worker delivers and acks.
	default:
		logs.WarnCtx(context.Background(), "doc update outbound shard queue full; delivering synchronously",
			"doc_id", collectionScopedDocID,
			"shard", idx,
			"partition", key,
			"shard_queue_cap", config.DocUpdateOutboundShardQueueCap)
		s.deliverOutboundDocUpdate(collectionScopedDocID, payloadCopy)
		natscore.AcknowledgeMessage(msg, "inline_fallback", natscore.GetDeliveryCount(msg))
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
			payload := append([]byte(nil), w.msg.Data()...)
			s.deliverOutboundDocUpdate(w.collectionScopedDocID, payload)
			natscore.AcknowledgeMessage(w.msg, "delivered", natscore.GetDeliveryCount(w.msg))
		}
	}
}

func (s *Server) startOutboundDocUpdateShardWorkers() {
	for i := range s.docUpdateOutboundShards {
		go s.runDocUpdateOutboundShardWorker(i)
	}
}
