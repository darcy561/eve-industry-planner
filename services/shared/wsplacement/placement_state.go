package wsplacement

import (
	"strings"

	natscore "eve-industry-planner/shared/core/nats"
)

// StatusPath is the websocket HTTP path that returns natscore.PlacementState JSON.
// NATS subject SoT: natscore.SubjectWSPlacementState; payload SoT: natscore.PlacementState.
const StatusPath = "/placement"

// FlagsFromCounts derives soft/full: threshold 0 disables that flag; else clients >= threshold.
func FlagsFromCounts(clients, targetClients, clientCutoff int) (soft, full bool) {
	return targetClients > 0 && clients >= targetClients,
		clientCutoff > 0 && clients >= clientCutoff
}

// NewPlacementState builds natscore.PlacementState from live count and config thresholds.
func NewPlacementState(containerID string, clients, targetClients, clientCutoff int, draining bool) natscore.PlacementState {
	soft, full := FlagsFromCounts(clients, targetClients, clientCutoff)
	return natscore.PlacementState{
		ContainerID: strings.TrimSpace(containerID),
		Clients:     max(clients, 0),
		Soft:        soft,
		Full:        full,
		Draining:    draining,
	}
}
