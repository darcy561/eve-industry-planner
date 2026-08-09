// Package config loads, validates, emits, and applies live eip.config.yaml.
// Day-2 Sync (capacity / Traefik / Grafana) mutates Swarm via Moby ServiceUpdate.
// Starter defaults (DefaultConfig) live in kit/templates/yamldefaults — not here.
// Generic YAML IO/aliases: yamlutil; this package owns Validate + config header + Sync/apply.
package config

import (
	"fmt"
	"maps"
	"net"
	"slices"
	"strings"

	"eve-industry-planner/deployment-tool/internal/yamlutil"
)

// Config is the operator YAML surface (eip.config.yaml).
// APP_VERSION (image tags / bake / Redis advertise) lives in `.env`, not here.
type Config struct {
	Version     int                    `yaml:"version"`
	Addons      Addons                 `yaml:"addons"`
	Ports       Ports                  `yaml:"ports"`
	Paths       Paths                  `yaml:"paths"`
	Proxy       Proxy                  `yaml:"proxy"`
	ScaleTiming ScaleTiming            `yaml:"scale_timing"`
	Services    map[string]ServiceSpec `yaml:"services"`
	CLI         CLI                    `yaml:"cli"` // deployment-tool/TUI only — not SyncEnvMap
}

// CLI holds local eip/TUI settings (never exported into containers via SyncEnvMap).
type CLI struct {
	// EnvBackupPath is a stem (relative to project home) or absolute path prefix for .env backups.
	// Files: {stem}-current.txt and {stem}-YYYYMMDD-HHMMSS.txt (keep 3 timestamped).
	// Default is under a folder so backups do not clutter project home.
	EnvBackupPath string `yaml:"env_backup_path"`
}

// DefaultEnvBackupStem is used when cli.env_backup_path is empty.
// Relative to project home → backups/env/env-current.txt, …
const DefaultEnvBackupStem = "backups/env/env"

// EffectiveEnvBackupPath returns cli.env_backup_path or DefaultEnvBackupStem.
func (c Config) EffectiveEnvBackupPath() string {
	s := strings.TrimSpace(c.CLI.EnvBackupPath)
	if s == "" {
		return DefaultEnvBackupStem
	}
	return s
}

type Addons struct {
	Observability ObservabilityAddon `yaml:"observability"`
}

// ObservabilityAddon is addons.observability in eip.config.yaml.
type ObservabilityAddon struct {
	Enabled bool                 `yaml:"enabled"`
	Grafana ObservabilityGrafana `yaml:"grafana"`
}

// ObservabilityGrafana is addons.observability.grafana.
type ObservabilityGrafana struct {
	// Public exposes Grafana on the edge (Traefik). Default false = private / no edge.
	Public bool `yaml:"public"`
	// BaseURL is scheme+host (optional port), no path. Combined with paths.grafana for GF_SERVER_ROOT_URL.
	// DefaultConfig sets DefaultGrafanaBaseURL; omit/blank still falls back to that.
	BaseURL string `yaml:"base_url"`
}

type Ports struct {
	HTTP             int `yaml:"http"`
	HTTPS            int `yaml:"https"`
	TraefikDashboard int `yaml:"traefik_dashboard"`
}

type Paths struct {
	Grafana          string `yaml:"grafana"`
	TraefikDashboard string `yaml:"traefik_dashboard"`
}

type Proxy struct {
	TrustedIPs   []string `yaml:"trusted_ips"`
	TrustedCIDRs []string `yaml:"trusted_cidrs"`
}

type ScaleTiming struct {
	Cooldown               string `yaml:"cooldown"`
	ScaleUpStabilization   string `yaml:"scale_up_stabilization"`
	ScaleDownStabilization string `yaml:"scale_down_stabilization"`
}

type ServiceSpec struct {
	CapacityControllerManaged bool    `yaml:"capacity_controller_managed"`
	Min                       int     `yaml:"min"`
	Max                       int     `yaml:"max"`
	Concurrency               int                `yaml:"concurrency,omitempty"`                 // worker
	TargetClients             int                `yaml:"target_clients,omitempty"`               // websocket
	ClientCutoff              int                `yaml:"client_cutoff,omitempty"`                // websocket
	ReserveCapacity           float64            `yaml:"reserve_capacity,omitempty"`             // websocket
	QueueScaleUpPct           map[string]float64 `yaml:"queue_scale_up_pct,omitempty"`           // worker: scale-up pending fraction per priority queue
}

// LoadYAML reads and validates operator config from path.
func LoadYAML(path string) (Config, error) {
	var cfg Config
	if err := yamlutil.UnmarshalFile(path, &cfg); err != nil {
		return Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// Validate fail-closes on missing/invalid capacity fields.
func (c Config) Validate() error {
	if c.Version != 1 {
		return fmt.Errorf("version: want 1, got %d", c.Version)
	}
	if c.Services == nil {
		return fmt.Errorf("services: required")
	}
	for _, name := range []string{"worker", "websocket", "api"} {
		s, ok := c.Services[name]
		if !ok {
			return fmt.Errorf("services.%s: required", name)
		}
		if s.Min < 1 {
			return fmt.Errorf("services.%s.min: must be >= 1", name)
		}
		if s.Max < s.Min {
			return fmt.Errorf("services.%s.max: must be >= min", name)
		}
	}
	w := c.Services["worker"]
	if w.Concurrency < 1 || w.Concurrency > 50 {
		return fmt.Errorf("services.worker.concurrency: want 1..50, got %d", w.Concurrency)
	}
	for k, v := range w.QueueScaleUpPct {
		if v < 0 {
			return fmt.Errorf("services.worker.queue_scale_up_pct.%s: must be >= 0, got %v", k, v)
		}
	}
	ws := c.Services["websocket"]
	if ws.ClientCutoff < 0 {
		return fmt.Errorf("services.websocket.client_cutoff: must be >= 0 (0 = unlimited)")
	}
	if ws.TargetClients < 0 {
		return fmt.Errorf("services.websocket.target_clients: must be >= 0 (0 = soft divert off)")
	}
	if ws.TargetClients > 0 && ws.ClientCutoff > 0 && ws.TargetClients > ws.ClientCutoff {
		return fmt.Errorf("services.websocket.target_clients: must be <= client_cutoff when both > 0 (got target=%d cutoff=%d)",
			ws.TargetClients, ws.ClientCutoff)
	}
	if ws.ReserveCapacity < 0 || ws.ReserveCapacity >= 1 {
		return fmt.Errorf("services.websocket.reserve_capacity: want 0 <= reserve < 1, got %v", ws.ReserveCapacity)
	}
	if err := validatePort("ports.http", c.Ports.HTTP); err != nil {
		return err
	}
	if err := validatePort("ports.https", c.Ports.HTTPS); err != nil {
		return err
	}
	if err := validatePort("ports.traefik_dashboard", c.Ports.TraefikDashboard); err != nil {
		return err
	}
	if err := validatePath("paths.grafana", c.Paths.Grafana); err != nil {
		return err
	}
	if c.Addons.Observability.Grafana.Public && strings.TrimSpace(c.Paths.Grafana) == "" {
		return fmt.Errorf("paths.grafana: required when addons.observability.grafana.public is true")
	}
	if err := validateGrafanaBaseURL(c.Addons.Observability.Grafana.BaseURL); err != nil {
		return err
	}
	if err := validatePath("paths.traefik_dashboard", c.Paths.TraefikDashboard); err != nil {
		return err
	}
	if err := validateTrustedIPs(c.Proxy.TrustedIPs); err != nil {
		return err
	}
	if err := validateTrustedCIDRs(c.Proxy.TrustedCIDRs); err != nil {
		return err
	}
	return nil
}

func validatePort(field string, n int) error {
	if n == 0 {
		return nil
	}
	if n < 1 || n > 65535 {
		return fmt.Errorf("%s: want 1..65535 (or 0/omit for default), got %d", field, n)
	}
	return nil
}

func validatePath(field, p string) error {
	p = strings.TrimSpace(p)
	if p == "" {
		return nil
	}
	if !strings.HasPrefix(p, "/") {
		return fmt.Errorf("%s: must start with / (got %q)", field, p)
	}
	return nil
}

func validateTrustedIPs(ips []string) error {
	for i, raw := range ips {
		s := strings.TrimSpace(raw)
		if s == "" {
			return fmt.Errorf("proxy.trusted_ips[%d]: empty entry", i)
		}
		if strings.Contains(s, "/") {
			return fmt.Errorf("proxy.trusted_ips[%d]: want bare IP (use trusted_cidrs for %q)", i, s)
		}
		if net.ParseIP(s) == nil {
			return fmt.Errorf("proxy.trusted_ips[%d]: want IP, got %q", i, s)
		}
	}
	return nil
}

func validateTrustedCIDRs(cidrs []string) error {
	for i, raw := range cidrs {
		s := strings.TrimSpace(raw)
		if s == "" {
			return fmt.Errorf("proxy.trusted_cidrs[%d]: empty entry", i)
		}
		if _, _, err := net.ParseCIDR(s); err != nil {
			if net.ParseIP(s) != nil {
				return fmt.Errorf("proxy.trusted_cidrs[%d]: want CIDR (use trusted_ips for %q)", i, s)
			}
			return fmt.Errorf("proxy.trusted_cidrs[%d]: want CIDR, got %q", i, s)
		}
	}
	return nil
}

// EffectiveTrustedProxies returns trimmed proxy.trusted_ips then trusted_cidrs.
func (c Config) EffectiveTrustedProxies() []string {
	n := len(c.Proxy.TrustedIPs) + len(c.Proxy.TrustedCIDRs)
	if n == 0 {
		return nil
	}
	out := make([]string, 0, n)
	seen := map[string]struct{}{}
	appendUnique := func(raw string) {
		s := strings.TrimSpace(raw)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	for _, raw := range c.Proxy.TrustedIPs {
		appendUnique(raw)
	}
	for _, raw := range c.Proxy.TrustedCIDRs {
		appendUnique(raw)
	}
	return out
}

// TrustedProxyCIDRsCSV is Traefik forwardedHeaders.trustedIPs.
func (c Config) TrustedProxyCIDRsCSV() string {
	return strings.Join(c.EffectiveTrustedProxies(), ",")
}

// EffectivePorts returns host publish ports (defaults 80/443/81).
func (c Config) EffectivePorts() Ports {
	p := c.Ports
	if p.HTTP == 0 {
		p.HTTP = 80
	}
	if p.HTTPS == 0 {
		p.HTTPS = 443
	}
	if p.TraefikDashboard == 0 {
		p.TraefikDashboard = 81
	}
	return p
}

// EffectivePaths returns URL path prefixes (defaults /grafana and /dashboard).
func (c Config) EffectivePaths() Paths {
	p := c.Paths
	if strings.TrimSpace(p.Grafana) == "" {
		p.Grafana = "/grafana"
	} else {
		p.Grafana = strings.TrimSpace(p.Grafana)
	}
	if strings.TrimSpace(p.TraefikDashboard) == "" {
		p.TraefikDashboard = "/dashboard"
	} else {
		p.TraefikDashboard = strings.TrimSpace(p.TraefikDashboard)
	}
	return p
}

// SyncEnvMap returns capacity/ports bridges for stack expand (process env).
func (c Config) SyncEnvMap() map[string]string {
	w := c.Services["worker"]
	ws := c.Services["websocket"]
	api := c.Services["api"]

	ports := c.EffectivePorts()
	paths := c.EffectivePaths()
	grafanaPath := paths.Grafana

	return map[string]string{
		"EIP_WORKER_REPLICAS":     itoa(w.Min),
		"EIP_WORKER_CAPACITY_MIN": itoa(w.Min),
		"EIP_WORKER_CAPACITY_MAX": itoa(w.Max),

		"EIP_WEBSOCKET_REPLICAS":     itoa(ws.Min),
		"EIP_WEBSOCKET_CAPACITY_MIN": itoa(ws.Min),
		"EIP_WEBSOCKET_CAPACITY_MAX": itoa(ws.Max),

		"EIP_API_REPLICAS":     itoa(api.Min),
		"EIP_API_CAPACITY_MIN": itoa(api.Min),
		"EIP_API_CAPACITY_MAX": itoa(api.Max),

		"EIP_HTTP_PORT":                   itoa(ports.HTTP),
		"EIP_HTTPS_PORT":                  itoa(ports.HTTPS),
		"EIP_TRAEFIK_DASHBOARD_PORT":      itoa(ports.TraefikDashboard),
		"EIP_GRAFANA_PATH":                grafanaPath,
		"EIP_TRAEFIK_DASHBOARD_PATH":      paths.TraefikDashboard,
		"EIP_TRAEFIK_TRUSTED_PROXY_CIDRS": c.TrustedProxyCIDRsCSV(),
		"GRAFANA_ROOT_URL":                c.EffectiveGrafanaRootURL(),
	}
}

// SyncEnv returns KEY=VALUE lines (stable order) for tests / logging.
func (c Config) SyncEnv() []string {
	env := c.SyncEnvMap()
	keys := slices.Sorted(maps.Keys(env))
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, k+"="+env[k])
	}
	return out
}

// SummaryLines are human-readable apply notes for eip sync logs.
func (c Config) SummaryLines() []string {
	var lines []string
	names := slices.Sorted(maps.Keys(c.Services))
	for _, n := range names {
		s := c.Services[n]
		line := fmt.Sprintf("%s: capacity_controller_managed=%t min=%d max=%d replicas(sync)=%d", n, s.CapacityControllerManaged, s.Min, s.Max, s.Min)
		switch n {
		case "worker":
			line += fmt.Sprintf(" concurrency=%d", s.Concurrency)
		case "websocket":
			line += fmt.Sprintf(" client_cutoff=%d target_clients=%d", s.ClientCutoff, s.TargetClients)
		}
		lines = append(lines, line)
	}
	ports := c.EffectivePorts()
	paths := c.EffectivePaths()
	lines = append(lines, fmt.Sprintf(
		"ports/paths: http=%d https=%d traefik_dashboard=%d grafana=%q grafana.public=%t grafana.root=%q dashboard_path=%q (applied by eip sync)",
		ports.HTTP, ports.HTTPS, ports.TraefikDashboard, paths.Grafana, c.Addons.Observability.Grafana.Public, c.EffectiveGrafanaRootURL(), paths.TraefikDashboard,
	))
	proxies := c.EffectiveTrustedProxies()
	if len(proxies) == 0 {
		lines = append(lines, "proxy.trusted_ips/cidrs: (none — Traefik uses direct peer IP)")
	} else {
		lines = append(lines, fmt.Sprintf("proxy.trusted_ips/cidrs: %s (Traefik forwardedHeaders)", strings.Join(proxies, ", ")))
	}
	lines = append(lines, "APP_VERSION: SoT is .env (tags/bake/advertise) — not eip.config / eip sync")
	return lines
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
