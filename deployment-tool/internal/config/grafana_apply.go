package config

import (
	"context"
	"fmt"
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

// LiveGrafana is the running Swarm grafana path settings (if present).
type LiveGrafana struct {
	Running       bool
	RootURL       string
	TraefikRule   string
	PathFromLabel string
}

// PathFromTraefikRule extracts the first PathPrefix value from a Traefik router rule.
func PathFromTraefikRule(rule string) string {
	m := pathPrefixRe.FindStringSubmatch(rule)
	if len(m) < 2 {
		return ""
	}
	return m[1]
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

func inspectGrafanaService(ctx context.Context, apiClient *client.Client, name, rootEnv, ruleLabelKey string) (LiveGrafana, error) {
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
	rule := result.Service.Spec.Labels[ruleLabelKey]
	return LiveGrafana{
		Running:       true,
		RootURL:       env[rootEnv],
		TraefikRule:   rule,
		PathFromLabel: PathFromTraefikRule(rule),
	}, nil
}

// ApplyGrafanaPath updates Swarm grafana env/labels from the obs stack file via
// Moby ServiceUpdate. Skips if grafana is not deployed or obs stack is missing.
func ApplyGrafanaPath(ctx context.Context, cfg Config, home, stackPrefix string, dryRun bool) error {
	if stackPrefix == "" {
		stackPrefix = "eip"
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

	svc := stackPrefix + "_" + surface.Service
	desirePath := cfg.EffectivePaths().Grafana
	wantRoot := stack.DesiredGrafanaRootURL(surface, desirePath)
	wantRule := stack.SubstituteEnv(surface.TraefikRule, "EIP_GRAFANA_PATH", desirePath)

	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		return fmt.Errorf("grafana sync: engine API client: %w", err)
	}
	defer apiClient.Close()
	live, err := inspectGrafanaService(ctx, apiClient, svc, surface.RootURLEnv, surface.TraefikRuleKey)
	if err != nil {
		return err
	}
	if !live.Running {
		msg.Line("skip grafana: not deployed (obs addon off)")
		return nil
	}
	if !GrafanaPathNeedsApply(live, desirePath, wantRoot) {
		msg.Line(fmt.Sprintf("unchanged grafana (path=%q)", desirePath))
		return nil
	}
	from := live.PathFromLabel
	if from == "" {
		from = live.RootURL
	}
	if from == "" {
		from = "(unset)"
	}
	msg.Line(fmt.Sprintf("plan grafana:\n  path: %s -> %s", from, desirePath))

	if dryRun {
		msg.Line("dry-run: would update " + svc)
		return nil
	}
	result, err := apiClient.ServiceInspect(ctx, svc, client.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("inspect service %s: %w", svc, err)
	}
	service := result.Service
	spec := service.Spec
	if spec.TaskTemplate.ContainerSpec == nil {
		return fmt.Errorf("update grafana %s: missing ContainerSpec", svc)
	}
	spec.TaskTemplate.ContainerSpec.Env = setEnv(
		spec.TaskTemplate.ContainerSpec.Env,
		map[string]string{surface.RootURLEnv: wantRoot},
		map[string]struct{}{surface.RootURLEnv: {}},
	)
	if spec.Labels == nil {
		spec.Labels = map[string]string{}
	}
	spec.Labels[surface.TraefikRuleKey] = wantRule
	if _, err := apiClient.ServiceUpdate(ctx, service.ID, client.ServiceUpdateOptions{
		Version: service.Version,
		Spec:    spec,
	}); err != nil {
		return fmt.Errorf("update grafana %s: %w", svc, err)
	}
	msg.Line("updated " + svc)
	return nil
}
