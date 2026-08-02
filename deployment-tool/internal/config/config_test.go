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

func TestSyncEnvStable(t *testing.T) {
	t.Parallel()
	cfg := yamldefaults.DefaultConfig()
	joined := strings.Join(cfg.SyncEnv(), "\n")
	for _, want := range []string{
		"EIP_WEBSOCKET_CAPACITY_MAX=4",
		"EIP_WORKER_CAPACITY_MAX=2",
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
}
