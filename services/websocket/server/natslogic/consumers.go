package natslogic

import (
	"time"

	"eve-industry-planner/websocket/server/identity"

	"github.com/nats-io/nats.go/jetstream"
)

// DocLiveUpdatesConsumerConfig is the JetStream consumer for doc.update fan-out.
func DocLiveUpdatesConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLiveUpdatesJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: "doc.update.>",
		DeliverPolicy: jetstream.DeliverNewPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
	}
}

// DocLockConsumerConfig is the JetStream consumer for doc.lock fan-out.
func DocLockConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLockJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:       durable,
		FilterSubject: "doc.lock.>",
		DeliverPolicy: jetstream.DeliverLastPolicy,
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
	}
}
