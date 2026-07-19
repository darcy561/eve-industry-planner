package identity

import (
	"eve-industry-planner/shared/core/instanceid"
	natscore "eve-industry-planner/shared/core/nats"
)

// JetStreamConsumerSuffix returns the stable per-process identifier used in
// JetStream durable names and ws_instance_id telemetry labels.
func JetStreamConsumerSuffix() string {
	return instanceid.Replica()
}

func DocLockJetStreamDurable() string {
	return natscore.DurablePrefixDocLock + JetStreamConsumerSuffix()
}

func DocLiveUpdatesJetStreamDurable() string {
	return natscore.DurablePrefixDocLiveUpdates + JetStreamConsumerSuffix()
}
