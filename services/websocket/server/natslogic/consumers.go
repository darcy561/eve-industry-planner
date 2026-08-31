package natslogic

import (
	"time"

	eipnats "eve-industry-planner/shared/nats"
	"eve-industry-planner/websocket/server/identity"

	"github.com/nats-io/nats.go/jetstream"
)

// DocFanoutConsumerInactiveThreshold is the crash/kill backstop: how long a
// per-container websocket JetStream durable may sit without pull activity before
// NATS deletes it. Graceful stop deletes durables explicitly; this covers missed
// shutdown. Without it, abandoned durables retain forever and inflate Grafana
// num_pending sums. Peer reconcile (NumWaiting==0) is a second backstop.
const DocFanoutConsumerInactiveThreshold = time.Hour

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
		InactiveThreshold: DocFanoutConsumerInactiveThreshold,
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
		InactiveThreshold: DocFanoutConsumerInactiveThreshold,
	}
}
