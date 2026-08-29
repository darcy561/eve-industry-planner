package capsoak

import (
	"fmt"
	"strings"
	"time"
)

// Profile selects which service drill to run.
type Profile string

const (
	ProfileWorker    Profile = "worker"
	ProfileWebsocket Profile = "websocket"
	ProfileAPI       Profile = "api" // hold WS load; assert api replicas (linked Evaluate)
)

// Phase selects which half of a drill to run.
type Phase string

const (
	PhaseAll  Phase = "all"  // scale-up then scale-down
	PhaseUp   Phase = "up"   // scale-up only (cleanup load/queue; no down wait)
	PhaseDown Phase = "down" // scale-down only (expect idle / already underutilised)
)

// Config is CLI-facing soak options.
type Config struct {
	Profile Profile
	Phase   Phase

	StackName string // Swarm service prefix, default "eip"

	// Timing expectations (operator should shorten eip.config scale_* for demos).
	Timeout     time.Duration // per phase (up or down)
	PollEvery   time.Duration
	ReportEvery time.Duration

	// Worker
	Queue       string // Asynq queue, default priority_1
	EnqueueN    int    // pending tasks while queue paused
	MinReplicas int    // expected floor after drain (default 1)
	MaxWatch    int    // fail if never reach this desired/running (default 2)

	// Websocket / api (soaklib ProfileHold, Accounts==Clients)
	WSURL       string
	Clients     int
	WSDuration  time.Duration // max hold wall (cancelled after scale-up)
	Ramp        time.Duration // stagger connects (0 = auto from client count)
	MinLive     int           // wait for this many live WS clients before scale-up assert (0 = auto ~80%)
	Insecure    bool
	NoSeed      bool
	SeedOnly    bool
}

func (c Config) withDefaults() Config {
	out := c
	if out.StackName == "" {
		out.StackName = "eip"
	}
	if out.Phase == "" {
		out.Phase = PhaseAll
	}
	if out.Timeout <= 0 {
		out.Timeout = 10 * time.Minute
	}
	if out.PollEvery <= 0 {
		out.PollEvery = 5 * time.Second
	}
	if out.ReportEvery <= 0 {
		out.ReportEvery = 15 * time.Second
	}
	if out.Queue == "" {
		out.Queue = "priority_1"
	}
	if out.EnqueueN <= 0 {
		out.EnqueueN = 40
	}
	if out.MinReplicas <= 0 {
		out.MinReplicas = 1
	}
	if out.MaxWatch <= 0 {
		out.MaxWatch = 2
	}
	if out.WSURL == "" {
		out.WSURL = "ws://traefik:80/ws"
	}
	if out.Clients <= 0 {
		out.Clients = 80
	}
	if out.WSDuration <= 0 {
		out.WSDuration = 5 * time.Minute
	}
	if out.Ramp < 0 {
		out.Ramp = 0
	}
	if out.Ramp == 0 && out.Clients > 20 {
		// ~25ms/client, capped — avoids dial stampede / session CAS pile-ups.
		out.Ramp = min(time.Duration(out.Clients)*25*time.Millisecond, 2*time.Minute)
	}
	if out.MinLive < 0 {
		out.MinLive = 0
	}
	if out.MinLive == 0 {
		out.MinLive = max((out.Clients*4)/5, 1)
	}
	return out
}

// ParseProfile maps CLI names.
func ParseProfile(s string) (Profile, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "worker":
		return ProfileWorker, nil
	case "websocket", "ws":
		return ProfileWebsocket, nil
	case "api":
		return ProfileAPI, nil
	default:
		return "", fmt.Errorf("profile must be worker|websocket|api, got %q", s)
	}
}

// ParsePhase maps CLI names.
func ParsePhase(s string) (Phase, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "all":
		return PhaseAll, nil
	case "up", "scale-up", "scaleup":
		return PhaseUp, nil
	case "down", "scale-down", "scaledown":
		return PhaseDown, nil
	default:
		return "", fmt.Errorf("phase must be all|up|down, got %q", s)
	}
}
