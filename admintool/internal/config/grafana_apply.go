package config

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
)

var pathPrefixRe = regexp.MustCompile(`PathPrefix\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)

// LiveGrafana is the running Swarm grafana path settings (if present).
type LiveGrafana struct {
	Running       bool
	RootURL       string
	TraefikRule   string
	PathFromLabel string
}

type grafanaInspect struct {
	Spec struct {
		Labels       map[string]string `json:"Labels"`
		TaskTemplate struct {
			ContainerSpec struct {
				Env []string `json:"Env"`
			} `json:"ContainerSpec"`
		} `json:"TaskTemplate"`
	} `json:"Spec"`
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

// InspectGrafanaService reads live grafana env/labels. Missing → Running=false.
func InspectGrafanaService(ctx context.Context, name, rootEnv, ruleLabelKey string) (LiveGrafana, error) {
	if name == "" {
		return LiveGrafana{Running: false}, nil
	}
	out, err := dockercli.TryOut(ctx, "service", "inspect", name, "--format", "{{json .}}")
	if err != nil {
		return LiveGrafana{Running: false}, nil
	}
	var raw grafanaInspect
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return LiveGrafana{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	env := parseEnvList(raw.Spec.TaskTemplate.ContainerSpec.Env)
	rule := raw.Spec.Labels[ruleLabelKey]
	return LiveGrafana{
		Running:       true,
		RootURL:       env[rootEnv],
		TraefikRule:   rule,
		PathFromLabel: PathFromTraefikRule(rule),
	}, nil
}

// ApplyGrafanaPath updates Swarm grafana env/labels from the obs stack file.
// Skips if grafana is not deployed or obs stack is missing.
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

	live, err := InspectGrafanaService(ctx, svc, surface.RootURLEnv, surface.TraefikRuleKey)
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

	args := []string{
		"service", "update", "--detach=true",
		"--env-add", surface.RootURLEnv + "=" + wantRoot,
		"--label-add", surface.TraefikRuleKey + "=" + wantRule,
		svc,
	}
	if dryRun {
		msg.Line("dry-run: docker " + strings.Join(args, " "))
		return nil
	}
	if err := dockercli.Run(ctx, args...); err != nil {
		return err
	}
	msg.Line("updated " + svc)
	return nil
}
