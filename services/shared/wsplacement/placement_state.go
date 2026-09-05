package wsplacement

import (
	"strings"

	eipnats "eve-industry-planner/shared/nats"
)

// StatusPath is the websocket HTTP path that returns eipnats.PlacementState JSON.
// NATS subject SoT: eipnats.SubjectWSPlacementState; payload SoT: eipnats.PlacementState.
const StatusPath = "/placement"

// FlagsFromCounts derives soft/full: threshold 0 disables that flag; else clients >= threshold.
func FlagsFromCounts(clients, targetClients, clientCutoff int) (soft, full bool) {
	return targetClients > 0 && clients >= targetClients,
		clientCutoff > 0 && clients >= clientCutoff
}

// NewPlacementState builds eipnats.PlacementState from live count and config thresholds.
func NewPlacementState(containerID string, clients, targetClients, clientCutoff int, draining bool) eipnats.PlacementState {
	soft, full := FlagsFromCounts(clients, targetClients, clientCutoff)
	return eipnats.PlacementState{
		ContainerID: strings.TrimSpace(containerID),
		Clients:     max(clients, 0),
		Soft:        soft,
		Full:        full,
		Draining:    draining,
	}
}
