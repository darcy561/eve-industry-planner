package docker

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/client"
)

// EngineProbe is a lightweight daemon/swarm readiness check.
type EngineProbe struct {
	Host          string // resolved endpoint; empty = SDK platform default
	APIVersion    string
	ServerVersion string
	Swarm         string // LocalNodeState, e.g. active | inactive
}

// ProbeResult is one combined engine + optional stack-health probe.
type ProbeResult struct {
	Engine       EngineProbe
	Health       HealthLight
	HealthDetail string
	AppVersion   string // deployed APP_VERSION from stack service env (empty if none)
	Err          error  // non-nil when the engine could not be reached / inspected
}

// HealthLight is the stack health rollup tone (maps to chip light names).
type HealthLight int

const (
	HealthOff HealthLight = iota
	HealthGreen
	HealthAmber
	HealthRed
)

// String returns the chipstate light name.
func (h HealthLight) String() string {
	switch h {
	case HealthGreen:
		return "green"
	case HealthAmber:
		return "amber"
	case HealthRed:
		return "red"
	default:
		return "off"
	}
}

// Probe runs Ping → Info (docker) → stack health when swarm is active.
// One client session; callers should bound ctx (~4s) to match TUI probe kill.
func Probe(ctx context.Context) ProbeResult {
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
	}

	host, _ := ResolveDockerEndpoint()
	out := ProbeResult{
		Engine: EngineProbe{Host: host, Swarm: "inactive"},
		Health: HealthOff,
	}

	cli, err := NewClient(client.WithTimeout(DefaultClientTimeout))
	if err != nil {
		out.Err = fmt.Errorf("docker client: %w", err)
		return out
	}
	defer cli.Close()

	ping, err := cli.Ping(ctx)
	if err != nil {
		out.Err = fmt.Errorf("engine ping: %w (is DOCKER_HOST / docker.sock available?)", err)
		return out
	}
	out.Engine.APIVersion = ping.APIVersion

	info, err := cli.Info(ctx)
	if err != nil {
		out.Err = fmt.Errorf("info unavailable: %w", err)
		return out
	}
	out.Engine.ServerVersion = info.ServerVersion
	if info.Swarm.LocalNodeState != "" {
		out.Engine.Swarm = string(info.Swarm.LocalNodeState)
	}

	if !strings.EqualFold(out.Engine.Swarm, "active") {
		out.Health = HealthOff
		out.HealthDetail = "swarm not active"
		return out
	}

	snap, err := LoadStackSnapshotWithHealth(ctx, cli, ResolveStackName())
	if err != nil {
		out.Health = HealthRed
		out.HealthDetail = err.Error()
		return out
	}
	out.AppVersion = snap.DeployedAppVersion()
	out.Health, out.HealthDetail = snap.HealthSummary()
	return out
}

func hasHealthcheck(svc swarm.Service) bool {
	cs := svc.Spec.TaskTemplate.ContainerSpec
	return cs != nil && cs.Healthcheck != nil
}

func containerHealth(ctx context.Context, cli client.APIClient, t swarm.Task) string {
	cs := t.Status.ContainerStatus
	if cs == nil || cs.ContainerID == "" {
		return ""
	}
	info, err := cli.ContainerInspect(ctx, cs.ContainerID)
	if err != nil || info.State == nil || info.State.Health == nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(info.State.Health.Status))
}
