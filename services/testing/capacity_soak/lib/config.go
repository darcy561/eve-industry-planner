// Package capsoak drives live-stack capacity-controller scale drills
// (worker Asynq backlog and websocket client load).
//
// CLI: go build -o ../.tmp/capacity_soak ./testing/capacity_soak
// Run on eip-core (see main.go header). Not linked into product binaries.
package capsoak

import (
	"fmt"
	"strings"
	"time"
)

// Profile selects which drill to run.
type Profile string

const (
	ProfileWorker    Profile = "worker"
	ProfileWebsocket Profile = "websocket"
)

// Config is CLI-facing soak options.
type Config struct {
	Profile Profile

	StackName string // Swarm service prefix, default "eip"

	// Timing expectations (operator should shorten eip.config scale_* for demos).
	Timeout     time.Duration
	PollEvery   time.Duration
	ReportEvery time.Duration

	// Worker
	Queue       string // Asynq queue, default priority_1
	EnqueueN    int    // pending tasks while queue paused
	MinReplicas int    // expected floor after drain (default 1)
	MaxWatch    int    // fail if never reach this desired/running (default 2)

	// Websocket (soaklib)
	WSURL       string
	Clients     int
	WSDuration  time.Duration
	InsecureTLS bool
	NoSeed      bool
	SeedOnly    bool
}

func (c Config) withDefaults() Config {
	out := c
	if out.StackName == "" {
		out.StackName = "eip"
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
		out.WSDuration = 3 * time.Minute
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
	default:
		return "", fmt.Errorf("profile must be worker|websocket, got %q", s)
	}
}
