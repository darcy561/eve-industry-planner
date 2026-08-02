package config

import (
	"strings"
	"testing"
)

func validConfig() Config {
	return Config{
		Version: 1,
		Services: map[string]ServiceSpec{
			"api":       {Min: 1, Max: 2},
			"worker":    {Min: 1, Max: 2, Concurrency: 10},
			"websocket": {Min: 1, Max: 2, ClientCutoff: 0},
		},
		Ports: Ports{HTTP: 80, HTTPS: 443, TraefikDashboard: 81},
		Paths: Paths{Grafana: "/grafana", TraefikDashboard: "/dashboard"},
	}
}

func TestValidateOK(t *testing.T) {
	t.Parallel()
	if err := validConfig().Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestValidateRejects(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		mutate  func(*Config)
		wantSub string
	}{
		{"version", func(c *Config) { c.Version = 2 }, "version"},
		{"services nil", func(c *Config) { c.Services = nil }, "services: required"},
		{"missing worker", func(c *Config) { delete(c.Services, "worker") }, "services.worker"},
		{"min < 1", func(c *Config) { s := c.Services["api"]; s.Min = 0; c.Services["api"] = s }, "services.api.min"},
		{"max < min", func(c *Config) { s := c.Services["api"]; s.Min = 3; s.Max = 2; c.Services["api"] = s }, "services.api.max"},
		{"concurrency high", func(c *Config) { s := c.Services["worker"]; s.Concurrency = 51; c.Services["worker"] = s }, "concurrency"},
		{"concurrency zero", func(c *Config) { s := c.Services["worker"]; s.Concurrency = 0; c.Services["worker"] = s }, "concurrency"},
		{"client_cutoff neg", func(c *Config) { s := c.Services["websocket"]; s.ClientCutoff = -1; c.Services["websocket"] = s }, "client_cutoff"},
		{"bad http port", func(c *Config) { c.Ports.HTTP = 70000 }, "ports.http"},
		{"path no slash", func(c *Config) { c.Paths.Grafana = "grafana" }, "paths.grafana"},
		{"ip as cidr", func(c *Config) { c.Proxy.TrustedIPs = []string{"10.0.0.0/8"} }, "trusted_ips"},
		{"empty ip", func(c *Config) { c.Proxy.TrustedIPs = []string{"  "} }, "trusted_ips"},
		{"cidr as ip", func(c *Config) { c.Proxy.TrustedCIDRs = []string{"10.0.0.1"} }, "trusted_cidrs"},
		{"bad cidr", func(c *Config) { c.Proxy.TrustedCIDRs = []string{"not-a-cidr"} }, "trusted_cidrs"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			cfg := validConfig()
			tc.mutate(&cfg)
			err := cfg.Validate()
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("got %q, want substring %q", err, tc.wantSub)
			}
		})
	}
}

func TestSyncEnvMapDefaults(t *testing.T) {
	t.Parallel()
	cfg := validConfig()
	cfg.Ports = Ports{}
	cfg.Paths = Paths{}
	env := cfg.SyncEnvMap()
	if env["EIP_HTTP_PORT"] != "80" || env["EIP_HTTPS_PORT"] != "443" || env["EIP_TRAEFIK_DASHBOARD_PORT"] != "81" {
		t.Fatalf("ports: %#v", env)
	}
	if env["EIP_GRAFANA_PATH"] != "/grafana" || env["EIP_TRAEFIK_DASHBOARD_PATH"] != "/dashboard" {
		t.Fatalf("paths: %#v", env)
	}
}

func TestEffectiveEnvBackupPath(t *testing.T) {
	t.Parallel()
	cfg := validConfig()
	if cfg.EffectiveEnvBackupPath() != DefaultEnvBackupStem {
		t.Fatalf("default=%q", cfg.EffectiveEnvBackupPath())
	}
	cfg.CLI.EnvBackupPath = "  custom-stem  "
	if cfg.EffectiveEnvBackupPath() != "custom-stem" {
		t.Fatalf("got %q", cfg.EffectiveEnvBackupPath())
	}
}

func TestSyncEnvMapExcludesCLI(t *testing.T) {
	t.Parallel()
	cfg := validConfig()
	cfg.CLI.EnvBackupPath = "secret-backup-path"
	for k := range cfg.SyncEnvMap() {
		if strings.Contains(strings.ToLower(k), "backup") || strings.Contains(strings.ToLower(k), "cli") {
			t.Fatalf("SyncEnvMap leaked cli key %s", k)
		}
	}
}

func TestTrustedProxyCIDRsCSV(t *testing.T) {
	t.Parallel()
	cfg := validConfig()
	cfg.Proxy.TrustedIPs = []string{"1.1.1.1", "1.1.1.1"}
	cfg.Proxy.TrustedCIDRs = []string{"10.0.0.0/8"}
	got := cfg.TrustedProxyCIDRsCSV()
	if got != "1.1.1.1,10.0.0.0/8" {
		t.Fatalf("got %q", got)
	}
}

func TestSummaryLines(t *testing.T) {
	t.Parallel()
	cfg := Config{
		Version: 1,
		Services: map[string]ServiceSpec{
			"api":       {Min: 1, Max: 2},
			"worker":    {Min: 1, Max: 2, Concurrency: 4},
			"websocket": {Min: 2, Max: 4, ClientCutoff: 100, TargetClients: 50},
		},
	}
	lines := cfg.SummaryLines()
	if len(lines) < 4 {
		t.Fatalf("got %v", lines)
	}
}
