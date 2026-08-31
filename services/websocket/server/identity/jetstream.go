package identity

import (
	"eve-industry-planner/shared/container"
	eipnats "eve-industry-planner/shared/nats"
)

func DocLockJetStreamDurable() string {
	return eipnats.DurablePrefixDocLock + container.ID()
}

func DocLiveUpdatesJetStreamDurable() string {
	return eipnats.DurablePrefixDocLiveUpdates + container.ID()
}
