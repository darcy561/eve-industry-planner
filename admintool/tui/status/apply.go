package status

import (
	"strings"

	"eve-industry-planner/admintool/internal/msg"
)

// ApplyEvent updates Snapshot chips from one chip Event (decoded EIPMSG).
// Returns true if Docker or Health light changed (caller should refresh menu gates).
func ApplyEvent(snap *Snapshot, ev msg.Event) (menuChanged bool) {
	if snap == nil {
		return false
	}
	switch ev.Kind {
	case msg.KindDocker:
		prev := snap.Docker
		applyDockerEvent(snap, ev)
		return snap.Docker != prev
	case msg.KindHealth:
		prev := snap.Health
		applyHealthEvent(snap, ev)
		return snap.Health != prev
	case msg.KindStack:
		applyStatusMsgEvent(snap, ev)
		return false
	case msg.KindApp:
		snap.AppVersion = strings.TrimSpace(ev.Message)
		return false
	default:
		return false
	}
}

// ApplyEvents applies multiple events; menuChanged if any Docker/Health light change.
func ApplyEvents(snap *Snapshot, events []msg.Event) (menuChanged bool) {
	for _, ev := range events {
		if ApplyEvent(snap, ev) {
			menuChanged = true
		}
	}
	return menuChanged
}

func applyDockerEvent(snap *Snapshot, ev msg.Event) {
	snap.Swarm = ev.State
	snap.DockerWord = "" // chip bar is lights-only
	if ev.Message != "" {
		snap.DockerDetail = ev.Message
	}
	switch strings.ToLower(ev.Light) {
	case msg.LightGreen:
		snap.Docker = LightGreen
	case msg.LightRed:
		snap.Docker = LightRed
	case msg.LightAmber:
		snap.Docker = LightAmber
	default:
		snap.Docker = LightOff
	}
	if strings.EqualFold(ev.State, "down") || strings.EqualFold(ev.Message, "unreachable") {
		snap.Docker = LightRed
		snap.Swarm = "unknown"
	}
}

func applyHealthEvent(snap *Snapshot, ev msg.Event) {
	if ev.Message != "" {
		snap.HealthDetail = ev.Message
	}
	switch strings.ToLower(ev.Light) {
	case msg.LightGreen:
		snap.Health = LightGreen
	case msg.LightRed:
		snap.Health = LightRed
	case msg.LightAmber:
		snap.Health = LightAmber
	default:
		snap.Health = LightOff
	}
}

// applyStatusMsgEvent sets unlabeled bar text from chip.stack (CLI verbs only).
// Prefers message; falls back to state.
func applyStatusMsgEvent(snap *Snapshot, ev msg.Event) {
	msg := strings.TrimSpace(ev.Message)
	if msg == "" {
		msg = strings.TrimSpace(ev.State)
	}
	if msg == "" {
		return
	}
	if snap.StatusMsg != msg {
		snap.StatusMsgTick = 0
	}
	snap.StatusMsg = msg
}
