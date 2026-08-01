package eipconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"eve-industry-planner/admintool/internal/dockercli"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/stack"
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

type traefikInspect struct {
	Spec struct {
		Labels       map[string]string `json:"Labels"`
		TaskTemplate struct {
			ContainerSpec struct {
				Env []string `json:"Env"`
			} `json:"ContainerSpec"`
		} `json:"TaskTemplate"`
	} `json:"Spec"`
	Endpoint struct {
		Spec struct {
			Ports []struct {
				Protocol      string `json:"Protocol"`
				TargetPort    uint32 `json:"TargetPort"`
				PublishedPort uint32 `json:"PublishedPort"`
				PublishMode   string `json:"PublishMode"`
			} `json:"Ports"`
		} `json:"Spec"`
	} `json:"Endpoint"`
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

// InspectTraefik reads live Traefik publish ports + dashboard rule + trusted proxy env.
func InspectTraefik(ctx context.Context, name, ruleLabelKey string) (LiveTraefik, error) {
	if name == "" {
		return LiveTraefik{}, fmt.Errorf("inspect traefik: empty service name")
	}
	out, err := dockercli.TryOut(ctx, "service", "inspect", name, "--format", "{{json .}}")
	if err != nil {
		return LiveTraefik{}, fmt.Errorf("docker service inspect %s: %w", name, err)
	}
	var raw traefikInspect
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return LiveTraefik{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	env := parseEnvList(raw.Spec.TaskTemplate.ContainerSpec.Env)
	live := LiveTraefik{
		PublishedByTarget: map[uint32]uint32{},
		DashboardRule:     raw.Spec.Labels[ruleLabelKey],
		TrustedProxyCIDRs: env[traefikEnvTrustedIPsWeb],
	}
	for _, p := range raw.Endpoint.Spec.Ports {
		live.PublishedByTarget[p.TargetPort] = p.PublishedPort
	}
	return live, nil
}

func publishAdd(published, target int, protocol, mode string) string {
	return fmt.Sprintf("published=%d,target=%d,protocol=%s,mode=%s", published, target, protocol, mode)
}

// ApplyTraefikUpdate updates publish mappings, dashboard PathPrefix label, and trusted proxy env.
func ApplyTraefikUpdate(ctx context.Context, desire DesiredTraefik, changes []Change, dryRun bool) error {
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

	args := []string{"service", "update", "--detach=true"}
	if needPublish {
		s := desire.Surface
		for _, p := range []stack.TraefikPublishPort{s.HTTP, s.HTTPS, s.Dashboard} {
			args = append(args, "--publish-rm", fmt.Sprintf("target=%d", p.Target))
		}
		args = append(args,
			"--publish-add", publishAdd(desire.HTTPPort, s.HTTP.Target, s.HTTP.Protocol, s.HTTP.Mode),
			"--publish-add", publishAdd(desire.HTTPSPort, s.HTTPS.Target, s.HTTPS.Protocol, s.HTTPS.Mode),
			"--publish-add", publishAdd(desire.DashboardPort, s.Dashboard.Target, s.Dashboard.Protocol, s.Dashboard.Mode),
		)
	}
	if needLabel {
		args = append(args, "--label-add", desire.Surface.DashboardRuleKey+"="+desire.DashboardRule)
	}
	if needTrustedEnv {
		if desire.TrustedProxyCIDRs == "" {
			args = append(args,
				"--env-rm", traefikEnvTrustedIPsWeb,
				"--env-rm", traefikEnvTrustedIPsWebsecure,
			)
		} else {
			args = append(args,
				"--env-add", traefikEnvTrustedIPsWeb+"="+desire.TrustedProxyCIDRs,
				"--env-add", traefikEnvTrustedIPsWebsecure+"="+desire.TrustedProxyCIDRs,
			)
		}
	}
	svc := desire.SwarmService
	if svc == "" {
		return fmt.Errorf("traefik update: empty SwarmService")
	}
	args = append(args, svc)

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

// ApplyTraefikConfig diffs and updates Traefik publish + dashboard path + proxy trust.
// Port targets, protocol/mode, and rule template come from appStackPath.
func ApplyTraefikConfig(ctx context.Context, cfg Config, appStackPath, stackPrefix string, dryRun bool) error {
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
	live, err := InspectTraefik(ctx, svc, surface.DashboardRuleKey)
	if err != nil {
		msg.Line("skip " + svc + " (not deployed)")
		return nil
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
	return ApplyTraefikUpdate(ctx, desire, changes, dryRun)
}
