package natslogic

import (
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/identity"

	"github.com/nats-io/nats.go/jetstream"
)

// DocLiveUpdatesConsumerConfig is the JetStream consumer for doc.update fan-out.
// Starts with an inert FilterSubjects set (no firehose); the server widens filters
// from local HostedTenants via UpdateConsumerFilterSubjects.
func DocLiveUpdatesConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLiveUpdatesJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:           durable,
		FilterSubjects:    []string{eipnats.DocUpdateFilterInert},
		DeliverPolicy:     jetstream.DeliverNewPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		AckWait:           30 * time.Second,
		InactiveThreshold: eipnats.DocFanoutInactiveThreshold,
	}
}

// DocLockConsumerConfig is the JetStream consumer for doc.lock fan-out.
// Starts inert; filters widen to doc.lock.{accountID} for hosted accounts.
func DocLockConsumerConfig() (durable string, cfg jetstream.ConsumerConfig) {
	durable = identity.DocLockJetStreamDurable()
	return durable, jetstream.ConsumerConfig{
		Durable:           durable,
		FilterSubjects:    []string{eipnats.DocLockFilterInert},
		DeliverPolicy:     jetstream.DeliverLastPolicy,
		AckPolicy:         jetstream.AckExplicitPolicy,
		AckWait:           30 * time.Second,
		InactiveThreshold: eipnats.DocFanoutInactiveThreshold,
	}
}
