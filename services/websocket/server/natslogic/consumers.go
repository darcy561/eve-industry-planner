package natslogic

import (
	"time"

	"eve-industry-planner/websocket/server/identity"

	"github.com/nats-io/nats.go/jetstream"
)

// DocFanoutConsumerInactiveThreshold is how long a per-replica websocket JetStream
// durable may sit without pull activity before NATS deletes it. Container recreates
// mint a new HOSTNAME-based durable; without this, abandoned durables retain forever
// and inflate Grafana num_pending sums.
const DocFanoutConsumerInactiveThreshold = time.Hour

// DocLiveUpdatesConsumerConfig is the JetStream consumer for doc.update fan-out.
func DocLiveUpdatesConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLiveUpdatesJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:           durable,
		FilterSubject:     "doc.update.>",
		DeliverPolicy:     jetstream.DeliverNewPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		AckWait:           30 * time.Second,
		InactiveThreshold: DocFanoutConsumerInactiveThreshold,
	}
}

// DocLockConsumerConfig is the JetStream consumer for doc.lock fan-out.
func DocLockConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLockJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:           durable,
		FilterSubject:     "doc.lock.>",
		DeliverPolicy:     jetstream.DeliverLastPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		AckWait:           30 * time.Second,
		InactiveThreshold: DocFanoutConsumerInactiveThreshold,
	}
}
