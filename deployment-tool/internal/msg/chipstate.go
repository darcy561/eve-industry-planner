// Chip helpers build and emit chip.* EIPMSG updates (status bar only).
// Kind values are the msg envelope type strings.
package msg

import (
	"encoding/json"
	"strings"
)

// Kind is an eipmsg chip type (Event.Kind == envelope Type).
const (
	KindDocker = TypeChipDocker
	KindHealth = TypeChipHealth
	KindStack  = TypeChipStack
	KindApp    = TypeChipApp
)

// Traffic-light tones on the wire (stable JSON strings).
const (
	LightOff   = "off"
	LightGreen = "green"
	LightAmber = "amber"
	LightRed   = "red"
)

// Event is one chip update after decode (and the in-process ApplyEvent shape).
// Kind is the envelope type (chip.docker / chip.health / chip.stack).
type Event struct {
	Kind    string `json:"-"` // set from envelope type; not duplicated in data
	State   string `json:"state,omitempty"`
	Light   string `json:"light,omitempty"`
	Message string `json:"message,omitempty"`
}

// Emit writes one chip event when eipmsg is enabled.
func Emit(ev Event) {
	if ev.Kind == "" || !IsChip(ev.Kind) {
		return
	}
	emit(ev.Kind, Event{State: ev.State, Light: ev.Light, Message: ev.Message})
}

// EventFromEnvelope rebuilds Event from a parsed chip EIPMSG.
func EventFromEnvelope(env Envelope) (Event, bool) {
	if !IsChip(env.Type) {
		return Event{}, false
	}
	var ev Event
	if len(env.Data) > 0 {
		_ = json.Unmarshal(env.Data, &ev)
	}
	ev.Kind = env.Type
	return ev, true
}

// DockerEventFromProbe maps swarm LocalNodeState (+ unreachable) to a docker Event.
func DockerEventFromProbe(swarm, detail string, unreachable bool) Event {
	if unreachable {
		return Event{Kind: KindDocker, State: "down", Light: LightRed, Message: "unreachable"}
	}
	state := strings.TrimSpace(swarm)
	if state == "" {
		state = "unknown"
	}
	light := LightAmber
	if strings.EqualFold(state, "active") {
		light = LightGreen
	}
	return Event{Kind: KindDocker, State: state, Light: light, Message: detail}
}

// EmitDockerFromSwarm emits chip.docker from probe fields.
func EmitDockerFromSwarm(swarm, detail string, unreachable bool) {
	Emit(DockerEventFromProbe(swarm, detail, unreachable))
}

// HealthEventFromProbe builds a chip.health Event from a light name + detail.
func HealthEventFromProbe(light, detail string) Event {
	return Event{Kind: KindHealth, Light: strings.ToLower(strings.TrimSpace(light)), Message: detail}
}

// HealthEventOff is health off (engine down / skipped).
func HealthEventOff(detail string) Event {
	return HealthEventFromProbe(LightOff, detail)
}

// EmitHealthFromProbe emits chip.health.
func EmitHealthFromProbe(light, detail string) {
	Emit(HealthEventFromProbe(light, detail))
}

// EmitStack emits chip.stack StatusMsg (user verbs only — never probe).
func EmitStack(state, light, message string) {
	Emit(Event{Kind: KindStack, State: state, Light: light, Message: message})
}

// EmitStackForVerb sets a short in-progress StatusMsg for a stub/lifecycle verb.
func EmitStackForVerb(verb string) {
	verb = strings.TrimSpace(verb)
	if verb == "" {
		return
	}
	EmitStack(verb, LightAmber, verb+"…")
}

// EmitAppVersion emits chip.app with the deployed APP_VERSION (message).
// Empty version clears the header when the stack is absent.
func EmitAppVersion(version string) {
	version = strings.TrimSpace(version)
	state := "none"
	if version != "" {
		state = "deployed"
	}
	Emit(Event{Kind: KindApp, State: state, Message: version})
}
