package soaklib

import (
	"fmt"
	"time"
)

// Profile selects which soak scenario Run executes.
type Profile string

const (
	ProfileHold     Profile = "hold"
	ProfileLimits   Profile = "limits"
	ProfilePressure Profile = "pressure"
	ProfileFanout   Profile = "fanout" // JetStream (default) or Mongo → WS delivery
)

// ParseProfile maps CLI/profile names to a Profile.
func ParseProfile(s string) (Profile, error) {
	switch Profile(s) {
	case ProfileHold, ProfileLimits, ProfilePressure, ProfileFanout:
		return Profile(s), nil
	default:
		return "", fmt.Errorf("profile must be hold|limits|pressure|fanout, got %q", s)
	}
}

// Config is the library entry for soak runs (populated by ws_soak CLI flags).
type Config struct {
	Profile Profile

	WSURL       string
	Clients     int
	Accounts    int // hold
	Duration    time.Duration
	Ramp        time.Duration
	ReportEvery time.Duration

	Affinity   string // hold
	CorpID     int64  // hold affinity / limits+pressure fill corp
	AllianceID int64  // hold

	Reconnect bool // hold
	Insecure  bool
	MaxDrop   float64

	SeedOnly bool
	NoSeed   bool

	ExpectTarget   int
	ExpectCutoff   int
	Require503     bool
	FlagWait       time.Duration
	SoftDivert     int
	FullProbes     int
	MinDivertRatio float64
	RequireColoc   bool

	Groups    int
	GroupSize int

	// ReadIdle is an optional client read deadline. 0 means none (preferred).
	// Gorilla treats read errors as permanent — do not use this as a ping timer.
	ReadIdle time.Duration

	// Publish selects the fan-out publisher (fanout profile).
	// Empty / PublishNone on fanout defaults to PublishJetStream.
	Publish PublishMode

	// Fanout: AllianceID/CorpID are optional id bases for a multi-org graph
	// (alliances, affiliated corps, standalone corps = CorpID+100000). Zero = defaults.
	// Defaults when flags are 0: clients=500 (bootstrap), rate=100, live-ratio=0.65,
	// affinity-mix=0.25; ramp defaults to 30s for fanout soft bootstrap.
	FanoutMessages int     // soft pub floor for warnings only (0 = none); publisher runs until -duration
	FanoutRate     float64 // publishes per second (0 = 100)
	FanoutMaxLoss  float64 // fail if 1 - recv/expect exceeds this (0 = require full delivery)
	// FanoutSeed seeds tenantGen RNG (0 = time-based).
	FanoutSeed int64
	// FanoutAffinityMix is the fraction of org members with corp/alliance affinity (0 = 0.25).
	FanoutAffinityMix float64
	// FanoutLiveRatio is the fraction of inventory kept connected by churnPool (0 = 0.65).
	FanoutLiveRatio float64
}

func (c Config) withDefaults() Config {
	out := c
	if out.WSURL == "" {
		out.WSURL = "ws://traefik:80/ws"
	}
	if out.Duration <= 0 {
		out.Duration = 5 * time.Minute
	}
	if out.Ramp < 0 {
		out.Ramp = 0
	}
	if out.ReportEvery < 0 {
		out.ReportEvery = 0
	}
	if out.MaxDrop <= 0 {
		out.MaxDrop = 1.0
	}
	if out.ExpectTarget <= 0 {
		out.ExpectTarget = 20
	}
	if out.ExpectCutoff <= 0 {
		out.ExpectCutoff = 40
	}
	if out.FlagWait <= 0 {
		out.FlagWait = 90 * time.Second
	}
	if out.MinDivertRatio <= 0 {
		out.MinDivertRatio = 0.8
	}
	if out.Publish == "" {
		out.Publish = PublishNone
	}
	if out.Profile == ProfileFanout && (out.Publish == "" || out.Publish == PublishNone) {
		out.Publish = PublishJetStream
	}
	return out
}
