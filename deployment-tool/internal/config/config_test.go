package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/config"
	"eve-industry-planner/deployment-tool/internal/kit/templates/yamldefaults"
)

func TestDefaultConfigValid(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if cfg.Services["worker"].Concurrency != 50 {
		t.Fatalf("worker.concurrency=%d", cfg.Services["worker"].Concurrency)
	}
	if cfg.CLI.EnvBackupPath != config.DefaultEnvBackupStem {
		t.Fatalf("cli.env_backup_path=%q", cfg.CLI.EnvBackupPath)
	}
}

func TestWriteYAMLRoundTrip(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "eip.config.yaml")
	if err := config.WriteYAML(path, yamldefaults.DefaultConfig()); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadYAML(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Services["websocket"].ClientCutoff != 2000 {
		t.Fatalf("client_cutoff=%d", cfg.Services["websocket"].ClientCutoff)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "env_backup_path:") {
		t.Fatalf("missing cli in:\n%s", raw)
	}
}

func TestLoadExampleYAML(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "eip.config.yaml")
	if err := config.WriteYAML(path, yamldefaults.DefaultConfig()); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadYAML(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Services["worker"].Concurrency != 50 {
		t.Fatalf("worker.concurrency=%d", cfg.Services["worker"].Concurrency)
	}
}

func TestGrafanaPublicRequiresPath(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	cfg.Addons.Observability.Grafana.Public = true
	cfg.Paths.Grafana = ""
	if err := cfg.Validate(); err == nil {
		t.Fatal("want error when public and paths.grafana empty")
	}
	cfg.Paths.Grafana = "/grafana"
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	cfg.Addons.Observability.Grafana.Public = false
	cfg.Paths.Grafana = ""
	if err := cfg.Validate(); err != nil {
		t.Fatalf("private allows empty grafana path: %v", err)
	}
}

func TestDefaultConfigGrafanaBaseURL(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	if cfg.Addons.Observability.Grafana.BaseURL != config.DefaultGrafanaBaseURL {
		t.Fatalf("base_url=%q want %q", cfg.Addons.Observability.Grafana.BaseURL, config.DefaultGrafanaBaseURL)
	}
	if cfg.Paths.Grafana != "/grafana" {
		t.Fatalf("path=%q", cfg.Paths.Grafana)
	}
	if got := cfg.EffectiveGrafanaRootURL(); got != "http://127.0.0.1/grafana/" {
		t.Fatalf("effective=%q", got)
	}
}

func TestGrafanaBaseURLCombinesWithPath(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	cfg.Paths.Grafana = "/ops"
	cfg.Addons.Observability.Grafana.BaseURL = "https://ops.example.com/ops"
	if err := cfg.Validate(); err == nil {
		t.Fatal("want error when base_url includes a path")
	}
	cfg.Addons.Observability.Grafana.BaseURL = "https://ops.example.com"
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := cfg.EffectiveGrafanaRootURL(); got != "https://ops.example.com/ops/" {
		t.Fatalf("effective=%q", got)
	}
	cfg.Addons.Observability.Grafana.BaseURL = ""
	if got := cfg.EffectiveGrafanaRootURL(); got != "http://127.0.0.1/ops/" {
		t.Fatalf("default effective=%q", got)
	}
}

func TestGrafanaPublicOmitDefaultsFalse(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "eip.config.yaml")
	// Minimal valid config without grafana.public key.
	raw := []byte(`version: 1
addons:
  observability:
    enabled: false
ports:
  http: 80
  https: 443
  traefik_dashboard: 81
paths:
  grafana: /grafana
  traefik_dashboard: /dashboard
services:
  worker:
    capacity_controller_managed: true
    min: 1
    max: 2
    concurrency: 50
  websocket:
    capacity_controller_managed: false
    min: 2
    max: 4
    target_clients: 1500
    client_cutoff: 2000
    reserve_capacity: 0.2
  api:
    capacity_controller_managed: true
    min: 1
    max: 4
`)
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadYAML(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addons.Observability.Grafana.Public {
		t.Fatal("omit grafana.public must default false")
	}
}

func TestSyncEnvStable(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	joined := strings.Join(cfg.SyncEnv(), "\n")
	for _, want := range []string{
		"EIP_WEBSOCKET_CAPACITY_MAX=5",
		"EIP_WORKER_CAPACITY_MAX=5",
		"EIP_API_CAPACITY_MAX=5",
		"EIP_API_REPLICAS=1",
		"EIP_HTTP_PORT=80",
		"GRAFANA_ROOT_URL=http://127.0.0.1/grafana/",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in:\n%s", want, joined)
		}
	}
	if strings.Contains(joined, "env_backup") || strings.Contains(joined, "EIP_CLI") {
		t.Fatalf("cli leaked into SyncEnv:\n%s", joined)
	}
	cfg.Paths.Grafana = "/ops"
	cfg.Addons.Observability.Grafana.BaseURL = "https://ops.example.com"
	joined = strings.Join(cfg.SyncEnv(), "\n")
	if !strings.Contains(joined, "GRAFANA_ROOT_URL=https://ops.example.com/ops/") {
		t.Fatalf("custom root missing in:\n%s", joined)
	}
	if !strings.Contains(joined, "EIP_GRAFANA_PATH=/ops") {
		t.Fatalf("path missing in:\n%s", joined)
	}
}
