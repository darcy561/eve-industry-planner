package identity

import (
	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
)

func DocLockJetStreamDurable() string {
	return natscore.DurablePrefixDocLock + container.ID()
}

func DocLiveUpdatesJetStreamDurable() string {
	return natscore.DurablePrefixDocLiveUpdates + container.ID()
}
