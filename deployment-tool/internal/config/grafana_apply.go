package config

import (
	"context"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/containerd/errdefs"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/msg"
	"eve-industry-planner/deployment-tool/internal/stack"
)

var pathPrefixRe = regexp.MustCompile(`PathPrefix\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)

// LiveGrafana is the running Swarm grafana path / Traefik label settings (if present).
type LiveGrafana struct {
	Running       bool
	RootURL       string
	TraefikRule   string
	PathFromLabel string
	TraefikEnable string
	Labels        map[string]string
}

// PathFromTraefikRule extracts the first PathPrefix value from a Traefik router rule.
func PathFromTraefikRule(rule string) string {
	m := pathPrefixRe.FindStringSubmatch(rule)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func traefikSwarmNetworkLabelKey(labels map[string]string) string {
	for k := range labels {
		if strings.Contains(k, "swarm.network") {
			return k
		}
	}
	return ""
}

// DesiredGrafanaLabels builds Traefik labels from stack templates + public flag.
// Network membership → ApplyLabeledNetworkMemberships.
func DesiredGrafanaLabels(surface stack.GrafanaApplySurface, desirePath, edgeNet string, public bool) map[string]string {
	out := make(map[string]string, len(surface.TraefikLabels)+1)
	for k, v := range surface.TraefikLabels {
		out[k] = stack.SubstituteEnv(v, "EIP_GRAFANA_PATH", desirePath)
	}
	if public {
		out[surface.TraefikEnableKey] = "true"
		if key := traefikSwarmNetworkLabelKey(surface.TraefikLabels); key != "" && edgeNet != "" {
			out[key] = edgeNet
		}
	} else {
		out[surface.TraefikEnableKey] = "false"
	}
	return out
}

// GrafanaPathNeedsApply reports whether live grafana path differs from desired.
func GrafanaPathNeedsApply(live LiveGrafana, desirePath, wantRoot string) bool {
	if !live.Running {
		return false
	}
	desirePath = strings.TrimSpace(desirePath)
	if live.RootURL != wantRoot {
		return true
	}
	if live.PathFromLabel != "" && live.PathFromLabel != desirePath {
		return true
	}
	return false
}

func inspectGrafanaService(ctx context.Context, apiClient *client.Client, name, rootEnv, ruleLabelKey, enableKey string) (LiveGrafana, error) {
	result, err := apiClient.ServiceInspect(ctx, name, client.ServiceInspectOptions{})
	if err != nil {
		if errdefs.IsNotFound(err) {
			return LiveGrafana{Running: false}, nil
		}
		return LiveGrafana{}, fmt.Errorf("inspect service %s: %w", name, err)
	}
	env := map[string]string{}
	if container := result.Service.Spec.TaskTemplate.ContainerSpec; container != nil {
		env = parseEnvList(container.Env)
	}
	labels := map[string]string{}
	maps.Copy(labels, result.Service.Spec.Labels)
	rule := labels[ruleLabelKey]
	return LiveGrafana{
		Running:       true,
		RootURL:       env[rootEnv],
		TraefikRule:   rule,
		PathFromLabel: PathFromTraefikRule(rule),
		TraefikEnable: labels[enableKey],
		Labels:        labels,
	}, nil
}

// ApplyGrafanaPath updates Grafana env + Traefik labels via ApplyServiceSpecPatch.
// Networks → ApplyLabeledNetworkMemberships only.
func ApplyGrafanaPath(ctx context.Context, cfg Config, home, stackPrefix string, dryRun bool) error {
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("grafana sync: engine API client: %w", err)
	}
	defer apiClient.Close()
	return applyGrafanaPath(ctx, apiClient, cfg, home, stackPrefix, dryRun)
}

func applyGrafanaPath(ctx context.Context, apiClient *client.Client, cfg Config, home, stackPrefix string, dryRun bool) error {
	if stackPrefix == "" {
		stackPrefix = kit.StackName
	}
	obsPath := filepath.Join(home, kit.ObsStackFile)
	if _, err := os.Stat(obsPath); err != nil {
		msg.Line("skip grafana: no " + kit.ObsStackFile)
		return nil
	}
	doc, err := stack.Load(obsPath)
	if err != nil {
		return err
	}
	surface, err := stack.GrafanaApplySurfaceFromDoc(doc)
	if err != nil {
		return err
	}

	edgeRef := ""
	if key := traefikSwarmNetworkLabelKey(surface.TraefikLabels); key != "" {
		edgeRef = strings.TrimSpace(surface.TraefikLabels[key])
	}
	edgeNet := edgeRef
	if edgeRef != "" {
		if resolved, err := stack.ResolveNetworkRef(edgeRef, doc); err == nil {
			edgeNet = resolved
		}
	}

	svc := docker.FullServiceName(stackPrefix, surface.Service)
	desirePath := cfg.EffectivePaths().Grafana
	wantRoot := cfg.EffectiveGrafanaRootURL()
	public := cfg.Addons.Observability.Grafana.Public
	wantLabels := DesiredGrafanaLabels(surface, desirePath, edgeNet, public)

	live, err := inspectGrafanaService(ctx, apiClient, svc, surface.RootURLEnv, surface.TraefikRuleKey, surface.TraefikEnableKey)
	if err != nil {
		return err
	}
	if !live.Running {
		msg.Line("skip grafana: not deployed (obs addon off)")
		return nil
	}

	pathDirty := GrafanaPathNeedsApply(live, desirePath, wantRoot)
	labelDirty := grafanaLabelsDirty(live, public, wantLabels)
	if !pathDirty && !labelDirty {
		msg.Line(fmt.Sprintf("unchanged grafana (path=%q public=%t)", desirePath, public))
		return nil
	}
	from := live.PathFromLabel
	if from == "" {
		from = live.RootURL
	}
	if from == "" {
		from = "(unset)"
	}
	msg.Line(fmt.Sprintf("plan grafana:\n  path: %s -> %s\n  public: %t", from, desirePath, public))

	return ApplyServiceSpecPatch(ctx, apiClient, ServiceSpecPatch{
		ServiceName: svc,
		Labels:      wantLabels,
		Env:         map[string]string{surface.RootURLEnv: wantRoot},
	}, dryRun)
}

func grafanaLabelsDirty(live LiveGrafana, public bool, wantLabels map[string]string) bool {
	if kit.Truthy(live.TraefikEnable) != public {
		return true
	}
	for k, want := range wantLabels {
		if live.Labels[k] != want {
			return true
		}
	}
	return false
}
