package identity

import (
	"fmt"

	"eve-industry-planner/shared/core/instanceid"
)

// JetStreamConsumerSuffix returns the stable per-process identifier used in
// JetStream durable names and ws_instance_id telemetry labels.
func JetStreamConsumerSuffix() string {
	return instanceid.Replica()
}

func DocLockJetStreamDurable() string {
	return fmt.Sprintf("doc-lock-%s", JetStreamConsumerSuffix())
}

func DocLiveUpdatesJetStreamDurable() string {
	return fmt.Sprintf("doc-live-updates-%s", JetStreamConsumerSuffix())
}
