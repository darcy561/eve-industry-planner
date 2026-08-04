package config

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/containerd/errdefs"
	"github.com/moby/moby/api/types/network"
	swarmtypes "github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

const (
	// Traefik container env keys for entrypoint forwardedHeaders.trustedIPs.
	traefikEnvTrustedIPsWeb       = "TRAEFIK_ENTRYPOINTS_WEB_FORWARDEDHEADERS_TRUSTEDIPS"
	traefikEnvTrustedIPsWebsecure = "TRAEFIK_ENTRYPOINTS_WEBSECURE_FORWARDEDHEADERS_TRUSTEDIPS"
)

// DesiredTraefik is host publish + dashboard PathPrefix + proxy trust for Traefik.
// Target ports, protocol/mode, and rule template come from stack YAML.
type DesiredTraefik struct {
	SwarmService      string
	Surface           stack.TraefikApplySurface
	HTTPPort          int // host published from eip.config
	HTTPSPort         int
	DashboardPort     int
	DashboardPath     string
	DashboardRule     string // rendered rule
	TrustedProxyCIDRs string
}

// LiveTraefik is the relevant subset of Traefik EndpointSpec + labels + env.
type LiveTraefik struct {
	PublishedByTarget map[uint32]uint32
	DashboardRule     string
	TrustedProxyCIDRs string
}

// DesiredTraefikFromConfig builds Traefik apply state from operator YAML + stack surface.
func DesiredTraefikFromConfig(cfg Config, surface stack.TraefikApplySurface) DesiredTraefik {
	ports := cfg.EffectivePorts()
	paths := cfg.EffectivePaths()
	path := paths.TraefikDashboard
	return DesiredTraefik{
		Surface:           surface,
		HTTPPort:          ports.HTTP,
		HTTPSPort:         ports.HTTPS,
		DashboardPort:     ports.TraefikDashboard,
		DashboardPath:     path,
		DashboardRule:     stack.SubstituteEnv(surface.DashboardRule, "EIP_TRAEFIK_DASHBOARD_PATH", path),
		TrustedProxyCIDRs: cfg.TrustedProxyCIDRsCSV(),
	}
}

// DiffTraefik returns publish/label/env changes needed to move live → desired.
func DiffTraefik(live LiveTraefik, desire DesiredTraefik) []Change {
	var ch []Change
	wantPub := map[uint32]int{
		uint32(desire.Surface.HTTP.Target):      desire.HTTPPort,
		uint32(desire.Surface.HTTPS.Target):     desire.HTTPSPort,
		uint32(desire.Surface.Dashboard.Target): desire.DashboardPort,
	}
	for target, want := range wantPub {
		got := int(live.PublishedByTarget[target])
		if got != want {
			ch = append(ch, Change{
				Field: fmt.Sprintf("publish:target=%d", target),
				From:  strconv.Itoa(got),
				To:    strconv.Itoa(want),
			})
		}
	}
	if live.DashboardRule != desire.DashboardRule {
		ch = append(ch, Change{
			Field: "label:" + desire.Surface.DashboardRuleKey,
			From:  live.DashboardRule,
			To:    desire.DashboardRule,
		})
	}
	if live.TrustedProxyCIDRs != desire.TrustedProxyCIDRs {
		ch = append(ch, Change{
			Field: "env:" + traefikEnvTrustedIPsWeb,
			From:  live.TrustedProxyCIDRs,
			To:    desire.TrustedProxyCIDRs,
		})
	}
	return ch
}

func inspectTraefik(ctx context.Context, apiClient *client.Client, name, ruleLabelKey string) (LiveTraefik, error) {
	result, err := apiClient.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
	if err != nil {
		// Preserve errdefs classification for callers (IsNotFound → skip).
		return LiveTraefik{}, err
	}
	svc := result.Service
	live := LiveTraefik{
		PublishedByTarget: map[uint32]uint32{},
		DashboardRule:     svc.Spec.Labels[ruleLabelKey],
	}
	if container := svc.Spec.TaskTemplate.ContainerSpec; container != nil {
		live.TrustedProxyCIDRs = parseEnvList(container.Env)[traefikEnvTrustedIPsWeb]
	}
	// Prefer Spec.EndpointSpec (what ServiceUpdate writes); fall back to Endpoint.Ports.
	ports := svc.Endpoint.Ports
	if svc.Spec.EndpointSpec != nil && len(svc.Spec.EndpointSpec.Ports) > 0 {
		ports = svc.Spec.EndpointSpec.Ports
	}
	for _, p := range ports {
		live.PublishedByTarget[p.TargetPort] = p.PublishedPort
	}
	return live, nil
}

func applyTraefikUpdate(ctx context.Context, apiClient *client.Client, desire DesiredTraefik, changes []Change, dryRun bool) error {
	if len(changes) == 0 {
		return nil
	}
	needPublish := false
	needLabel := false
	needTrustedEnv := false
	for _, c := range changes {
		switch {
		case strings.HasPrefix(c.Field, "publish:"):
			needPublish = true
		case strings.HasPrefix(c.Field, "label:"):
			needLabel = true
		case c.Field == "env:"+traefikEnvTrustedIPsWeb:
			needTrustedEnv = true
		}
	}

	svc := desire.SwarmService
	if svc == "" {
		return fmt.Errorf("traefik update: empty SwarmService")
	}
	patch := ServiceSpecPatch{ServiceName: svc}
	if needLabel {
		patch.Labels = map[string]string{
			desire.Surface.DashboardRuleKey: desire.DashboardRule,
		}
	}
	if needTrustedEnv {
		if desire.TrustedProxyCIDRs == "" {
			patch.EnvUnset = []string{traefikEnvTrustedIPsWeb, traefikEnvTrustedIPsWebsecure}
		} else {
			patch.Env = map[string]string{
				traefikEnvTrustedIPsWeb:       desire.TrustedProxyCIDRs,
				traefikEnvTrustedIPsWebsecure: desire.TrustedProxyCIDRs,
			}
		}
	}
	if needPublish {
		patch.Mutate = func(spec *swarmtypes.ServiceSpec) error {
			if spec.EndpointSpec == nil {
				spec.EndpointSpec = &swarmtypes.EndpointSpec{}
			}
			targets := map[uint32]struct{}{
				uint32(desire.Surface.HTTP.Target):      {},
				uint32(desire.Surface.HTTPS.Target):     {},
				uint32(desire.Surface.Dashboard.Target): {},
			}
			ports := make([]swarmtypes.PortConfig, 0, len(spec.EndpointSpec.Ports)+3)
			for _, p := range spec.EndpointSpec.Ports {
				if _, replace := targets[p.TargetPort]; !replace {
					ports = append(ports, p)
				}
			}
			for _, p := range []struct {
				published int
				port      stack.TraefikPublishPort
			}{
				{desire.HTTPPort, desire.Surface.HTTP},
				{desire.HTTPSPort, desire.Surface.HTTPS},
				{desire.DashboardPort, desire.Surface.Dashboard},
			} {
				ports = append(ports, swarmtypes.PortConfig{
					PublishedPort: uint32(p.published),
					TargetPort:    uint32(p.port.Target),
					Protocol:      network.IPProtocol(p.port.Protocol),
					PublishMode:   swarmtypes.PortConfigPublishMode(p.port.Mode),
				})
			}
			spec.EndpointSpec.Ports = ports
			return nil
		}
	}
	return ApplyServiceSpecPatch(ctx, apiClient, patch, dryRun)
}

func removeEnv(env []string, keys map[string]struct{}) []string {
	out := make([]string, 0, len(env))
	for _, item := range env {
		key, _, ok := strings.Cut(item, "=")
		if !ok {
			out = append(out, item)
			continue
		}
		if _, remove := keys[key]; !remove {
			out = append(out, item)
		}
	}
	return out
}

// ApplyTraefikConfig diffs and updates Traefik publish + dashboard path + proxy trust.
// Port targets, protocol/mode, and rule template come from appStackPath.
func ApplyTraefikConfig(ctx context.Context, cfg Config, appStackPath, stackPrefix string, dryRun bool) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("traefik sync: engine API client: %w", err)
	}
	defer apiClient.Close()
	return applyTraefikConfig(ctx, apiClient, cfg, appStackPath, stackPrefix, dryRun)
}

func applyTraefikConfig(ctx context.Context, apiClient *client.Client, cfg Config, appStackPath, stackPrefix string, dryRun bool) error {
	if stackPrefix == "" {
		stackPrefix = "eip"
	}
	doc, err := stack.Load(appStackPath)
	if err != nil {
		return err
	}
	surface, err := stack.TraefikApplySurfaceFromDoc(doc)
	if err != nil {
		return err
	}

	svc := stackPrefix + "_traefik"
	desire := DesiredTraefikFromConfig(cfg, surface)
	desire.SwarmService = svc
	live, err := inspectTraefik(ctx, apiClient, svc, surface.DashboardRuleKey)
	if err != nil {
		if errdefs.IsNotFound(err) {
			msg.Line("skip " + svc + " (not deployed)")
			return nil
		}
		return fmt.Errorf("inspect service %s: %w", svc, err)
	}
	changes := DiffTraefik(live, desire)
	if len(changes) == 0 {
		msg.Line(fmt.Sprintf("unchanged %s (ports/paths/proxy)", svc))
		return nil
	}
	msg.Line("plan " + svc + ":")
	for _, c := range changes {
		from := c.From
		if from == "" {
			from = "(unset)"
		}
		to := c.To
		if to == "" {
			to = "(unset)"
		}
		msg.Line(fmt.Sprintf("  %s: %s -> %s", c.Field, from, to))
	}
	return applyTraefikUpdate(ctx, apiClient, desire, changes, dryRun)
}
