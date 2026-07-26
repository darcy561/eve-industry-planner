package status

import (
	tea "github.com/charmbracelet/bubbletea"

	"eve-industry-planner/admintool/cmd/commands"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/tui/exec"
)

// Light is a traffic-light tone for operator chips.
type Light int

const (
	LightOff   Light = iota // probing / unknown / not scored
	LightGreen              // ready / healthy
	LightAmber              // degraded / in progress
	LightRed                // unreachable / unhealthy
)

// Snapshot is the live chip-bar state (menu gate reads Docker light from here).
//
// Docker: green = engine + swarm active; amber = engine up, swarm not ready;
// red = engine down. Health: live Swarm stack rollup (chip.health). StatusMsg:
// unlabeled bar text from user CLI verbs (chip.stack).
type Snapshot struct {
	ToolVersion string
	AppVersion  string // deployed APP_VERSION from chip.app (probe)

	Docker       Light
	DockerWord   string
	DockerDetail string
	Swarm        string

	Health       Light
	HealthDetail string

	StatusMsg     string
	StatusMsgTick int // marquee frame; advanced by home on MarqueeTick
}

// Msg delivers a refreshed Snapshot from a background probe.
type Msg struct {
	Snap Snapshot
}

// Default returns chips in the unknown / probing state.
func Default() Snapshot {
	return Snapshot{
		ToolVersion: commands.Version,
		Docker:      LightOff,
		DockerWord:  "",
		Health:      LightOff,
		Swarm:       "unknown",
	}
}

// ProbeCmd runs background `eip probe` (alias of public `eip doctor`).
// Applies chip.docker + chip.health + chip.app into a new Snapshot (never chip.stack).
// Home merges live StatusMsg onto the result so probe cannot wipe CLI text.
// Always returns Msg so the home poller cannot stick on refreshing.
func ProbeCmd(base Snapshot) tea.Cmd {
	return func() tea.Msg {
		snap := Default()
		snap.ToolVersion = base.ToolVersion
		if snap.ToolVersion == "" {
			snap.ToolVersion = commands.Version
		}
		// Sticky until a successful probe emits chip.app (hard engine-down skips emit).
		snap.AppVersion = base.AppVersion

		func() {
			defer func() {
				if recover() != nil {
					ApplyEvent(&snap, msg.DockerEventFromProbe("", "", true))
					ApplyEvent(&snap, msg.HealthEventOff("probe panic"))
				}
			}()
			_, events, _ := exec.CollectProbe([]string{"probe"})
			if len(events) > 0 {
				ApplyEvents(&snap, events)
			} else {
				// No chip EIPMSG — treat as engine unreachable (no stdout scrape).
				ApplyEvent(&snap, msg.DockerEventFromProbe("", "", true))
				ApplyEvent(&snap, msg.HealthEventOff(""))
			}
		}()

		return Msg{Snap: snap}
	}
}
