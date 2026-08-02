package eipconfig

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

const grafanaContainerName = "grafana"

var pathPrefixRe = regexp.MustCompile(`PathPrefix\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)

// LiveGrafana is the running Compose grafana path settings (if present).
type LiveGrafana struct {
	Running       bool
	RootURL       string
	TraefikRule   string
	PathFromLabel string // extracted PathPrefix, if any
}

type containerInspect struct {
	Config struct {
		Env    []string          `json:"Env"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
	State struct {
		Running bool   `json:"Running"`
		Status  string `json:"Status"`
	} `json:"State"`
}

// GrafanaRootURL builds GF_SERVER_ROOT_URL for a path prefix (e.g. /grafana → http://127.0.0.1/grafana/).
func GrafanaRootURL(pathPrefix string) string {
	pathPrefix = strings.TrimSpace(pathPrefix)
	if pathPrefix == "" {
		pathPrefix = "/grafana"
	}
	return "http://127.0.0.1" + pathPrefix + "/"
}

// PathFromTraefikRule extracts the first PathPrefix value from a Traefik router rule.
func PathFromTraefikRule(rule string) string {
	m := pathPrefixRe.FindStringSubmatch(rule)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

// InspectGrafana reads live grafana container env/labels. Missing container → Running=false.
func InspectGrafana(name string) (LiveGrafana, error) {
	if name == "" {
		name = grafanaContainerName
	}
	cmd := exec.Command("docker", "inspect", name, "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		// Not running / not present — skip apply (prod lean / addon off).
		return LiveGrafana{Running: false}, nil
	}
	var raw containerInspect
	if err := json.Unmarshal(out, &raw); err != nil {
		return LiveGrafana{}, fmt.Errorf("parse inspect %s: %w", name, err)
	}
	if !raw.State.Running {
		return LiveGrafana{Running: false}, nil
	}
	env := parseEnvList(raw.Config.Env)
	rule := raw.Config.Labels["traefik.http.routers.grafana.rule"]
	return LiveGrafana{
		Running:       true,
		RootURL:       env["GF_SERVER_ROOT_URL"],
		TraefikRule:   rule,
		PathFromLabel: PathFromTraefikRule(rule),
	}, nil
}

// GrafanaPathNeedsApply reports whether live grafana path differs from desired.
func GrafanaPathNeedsApply(live LiveGrafana, desirePath string) bool {
	if !live.Running {
		return false
	}
	desirePath = strings.TrimSpace(desirePath)
	wantRoot := GrafanaRootURL(desirePath)
	if live.RootURL != wantRoot {
		return true
	}
	if live.PathFromLabel != "" && live.PathFromLabel != desirePath {
		return true
	}
	return false
}

// ApplyGrafanaPath recreates Compose grafana only when paths.grafana differs.
// Skips if grafana is not running. Never touches mongo/redis/nats/core/frontend.
func ApplyGrafanaPath(cfg Config, dryRun bool) error {
	desirePath := cfg.EffectivePaths().Grafana
	live, err := InspectGrafana(grafanaContainerName)
	if err != nil {
		return err
	}
	if !live.Running {
		fmt.Println("skip grafana: not running (prod lean / addon off)")
		return nil
	}
	if !GrafanaPathNeedsApply(live, desirePath) {
		fmt.Printf("unchanged grafana (path=%q)\n", desirePath)
		return nil
	}
	from := live.PathFromLabel
	if from == "" {
		from = live.RootURL
	}
	if from == "" {
		from = "(unset)"
	}
	fmt.Printf("plan grafana:\n  path: %s -> %s\n", from, desirePath)

	root, err := os.Getwd()
	if err != nil {
		return err
	}
	// Prefer repo root (swarm-sync runs from ROOT; go run may be under services/).
	if filepath.Base(root) == "services" {
		root = filepath.Dir(root)
	}
	// Ephemeral sync-env (EIP_SYNC_ENV_FILE) when apply is driven with a temp env file.
	syncEnv := os.Getenv("EIP_SYNC_ENV_FILE")
	envFile := filepath.Join(root, ".env")
	base := filepath.Join(root, "docker-compose.yml")
	dev := filepath.Join(root, "docker-compose.dev.yml")

	args := []string{"compose", "--env-file", envFile}
	if syncEnv != "" {
		if _, err := os.Stat(syncEnv); err == nil {
			args = append(args, "--env-file", syncEnv)
		}
	}
	args = append(args, "-f", base)
	if _, err := os.Stat(dev); err == nil {
		args = append(args, "-f", dev)
	}
	args = append(args, "up", "-d", "--no-deps", "--force-recreate", "grafana")

	if dryRun {
		fmt.Printf("dry-run: docker %s\n", strings.Join(args, " "))
		return nil
	}
	cmd := exec.Command("docker", args...)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s: %w\n%s", strings.Join(args, " "), err, string(out))
	}
	fmt.Println("updated grafana (path recreate)")
	if msg := strings.TrimSpace(string(out)); msg != "" {
		fmt.Println(msg)
	}
	return nil
}
