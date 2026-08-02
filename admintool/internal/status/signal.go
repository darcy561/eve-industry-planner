package status

import (
	"fmt"

	"eve-industry-planner/admintool/internal/docker"
)

// Signal is a per-service or overall status badge (bash sh parity).
type Signal string

const (
	OK       Signal = "OK"
	OKStar   Signal = "OK*"
	Partial  Signal = "PARTIAL"
	Down     Signal = "DOWN"
	Problems Signal = "PROBLEMS"
)

// ServiceRow is one expected service evaluated against a snapshot.
type ServiceRow struct {
	Short    string   `json:"short"`
	Label    string   `json:"label"`
	Critical bool     `json:"critical"`
	Signal   Signal   `json:"signal"`
	Detail   string   `json:"detail"`
	Ports    string   `json:"ports,omitempty"`
	Tasks    []string `json:"tasks,omitempty"`
}

// ServiceSignal classifies a Swarm service for operator status (OK/PARTIAL/DOWN).
func ServiceSignal(stackPresent, exists bool, desired, running, starting uint64) (Signal, string) {
	if !stackPresent {
		return Down, "app stack not deployed"
	}
	if !exists {
		return Down, "missing from stack (should be there)"
	}
	if running >= desired && desired > 0 {
		return OK, docker.FormatReplicaDetail(running, desired, 0)
	}
	if running > 0 || starting > 0 {
		return Partial, docker.FormatReplicaDetail(running, desired, starting)
	}
	return Down, fmt.Sprintf("0/%d up", desired)
}

// OverallSignal builds the Summary row from counters (bash emit_summary).
func OverallSignal(stackPresent bool, criticalBad, opsBad int) (Signal, string) {
	if !stackPresent {
		return Down, "nothing is running — try: eip up"
	}
	if criticalBad == 0 && opsBad == 0 {
		return OK, "everything expected is up"
	}
	if criticalBad == 0 {
		return OKStar, fmt.Sprintf("app is up; %d monitoring/tool issue(s)", opsBad)
	}
	return Problems, fmt.Sprintf("%d important service(s) not healthy", criticalBad)
}
