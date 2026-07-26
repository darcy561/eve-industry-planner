package eipconfig

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

const traefikSwarmService = "eip_traefik"

const (
	traefikDashboardRuleLabel = "traefik.http.routers.traefik-dashboard.rule"
	traefikTargetHTTP         = 80
	traefikTargetHTTPS        = 443
	traefikTargetDashboard    = 81

	// Traefik env for forwardedHeaders.trustedIPs on public entrypoints.
	traefikEnvTrustedIPsWeb       = "TRAEFIK_ENTRYPOINTS_WEB_FORWARDEDHEADERS_TRUSTEDIPS"
	traefikEnvTrustedIPsWebsecure = "TRAEFIK_ENTRYPOINTS_WEBSECURE_FORWARDEDHEADERS_TRUSTEDIPS"
)

// DesiredTraefik is host publish + dashboard PathPrefix + proxy trust for eip_traefik.
// Container entrypoints stay :80/:443/:81; only published host ports, the
// dashboard PathPrefix label, and trusted proxy CIDRs are operator-configurable.
type DesiredTraefik struct {
	HTTPPort          int
	HTTPSPort         int
	DashboardPort     int
	DashboardPath     string
	DashboardRule     string // full Traefik rule label value
	TrustedProxyCIDRs string // comma-separated; empty = unset env (direct peer)
}

// LiveTraefik is the relevant subset of eip_traefik EndpointSpec + deploy labels + env.
type LiveTraefik struct {
	PublishedByTarget map[uint32]uint32 // target port → published host port
	DashboardRule     string
	TrustedProxyCIDRs string // from web entrypoint env (websecure should match)
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

// DesiredTraefikFromConfig builds Traefik apply state from effective ports/paths/proxy.
func DesiredTraefikFromConfig(cfg Config) DesiredTraefik {
	ports := cfg.EffectivePorts()
	paths := cfg.EffectivePaths()
	return DesiredTraefik{
		HTTPPort:          ports.HTTP,
		HTTPSPort:         ports.HTTPS,
		DashboardPort:     ports.TraefikDashboard,
		DashboardPath:     paths.TraefikDashboard,
		DashboardRule:     TraefikDashboardRule(paths.TraefikDashboard),
		TrustedProxyCIDRs: cfg.TrustedProxyCIDRsCSV(),
	}
}

// TraefikDashboardRule builds the Swarm deploy label for the Traefik dashboard router.
func TraefikDashboardRule(pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		pathPrefix = "/dashboard"
	}
	return fmt.Sprintf("PathPrefix(`%s`) || PathPrefix(`/api`)", pathPrefix)
}

// DiffTraefik returns publish/label/env changes needed to move live → desired.
func DiffTraefik(live LiveTraefik, desire DesiredTraefik) []Change {
	var ch []Change
	wantPub := map[uint32]int{
		traefikTargetHTTP:      desire.HTTPPort,
		traefikTargetHTTPS:     desire.HTTPSPort,
		traefikTargetDashboard: desire.DashboardPort,
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
			Field: "label:" + traefikDashboardRuleLabel,
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

// InspectTraefik reads live eip_traefik publish ports + dashboard rule + trusted proxy env.
func InspectTraefik(name string) (LiveTraefik, error) {
	if name == "" {
		name = traefikSwarmService
	}
	cmd := exec.Command("docker", "service", "inspect", name, "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		return LiveTraefik{}, fmt.Errorf("docker service inspect %s: %w", name, err)
	}
	var raw traefikInspect
	if err := json.Unmarshal(out, &raw); err != nil {
		return LiveTraefik{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	env := parseEnvList(raw.Spec.TaskTemplate.ContainerSpec.Env)
	live := LiveTraefik{
		PublishedByTarget: map[uint32]uint32{},
		DashboardRule:     raw.Spec.Labels[traefikDashboardRuleLabel],
		TrustedProxyCIDRs: env[traefikEnvTrustedIPsWeb],
	}
	for _, p := range raw.Endpoint.Spec.Ports {
		live.PublishedByTarget[p.TargetPort] = p.PublishedPort
	}
	return live, nil
}

// ApplyTraefikUpdate updates publish mappings, dashboard PathPrefix label, and trusted proxy env.
func ApplyTraefikUpdate(desire DesiredTraefik, changes []Change, dryRun bool) error {
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
		// Replace host publish for fixed container targets 80/443/81.
		for _, target := range []int{traefikTargetHTTP, traefikTargetHTTPS, traefikTargetDashboard} {
			args = append(args, "--publish-rm", fmt.Sprintf("target=%d", target))
		}
		args = append(args,
			"--publish-add", fmt.Sprintf("published=%d,target=%d,protocol=tcp,mode=ingress", desire.HTTPPort, traefikTargetHTTP),
			"--publish-add", fmt.Sprintf("published=%d,target=%d,protocol=tcp,mode=ingress", desire.HTTPSPort, traefikTargetHTTPS),
			"--publish-add", fmt.Sprintf("published=%d,target=%d,protocol=tcp,mode=ingress", desire.DashboardPort, traefikTargetDashboard),
		)
	}
	if needLabel {
		args = append(args, "--label-add", traefikDashboardRuleLabel+"="+desire.DashboardRule)
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
	args = append(args, traefikSwarmService)

	if dryRun {
		fmt.Printf("dry-run: docker %s\n", strings.Join(args, " "))
		return nil
	}
	cmd := exec.Command("docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s: %w\n%s", strings.Join(args, " "), err, string(out))
	}
	fmt.Printf("updated %s\n", traefikSwarmService)
	if msg := strings.TrimSpace(string(out)); msg != "" && msg != traefikSwarmService {
		fmt.Println(msg)
	}
	return nil
}

// ApplyTraefikConfig diffs and updates eip_traefik publish + dashboard path + proxy trust.
func ApplyTraefikConfig(cfg Config, dryRun bool) error {
	desire := DesiredTraefikFromConfig(cfg)
	live, err := InspectTraefik(traefikSwarmService)
	if err != nil {
		return err
	}
	changes := DiffTraefik(live, desire)
	if len(changes) == 0 {
		fmt.Printf("unchanged %s (ports/paths/proxy)\n", traefikSwarmService)
		return nil
	}
	fmt.Printf("plan %s:\n", traefikSwarmService)
	for _, c := range changes {
		from := c.From
		if from == "" {
			from = "(unset)"
		}
		to := c.To
		if to == "" {
			to = "(unset)"
		}
		fmt.Printf("  %s: %s -> %s\n", c.Field, from, to)
	}
	return ApplyTraefikUpdate(desire, changes, dryRun)
}
