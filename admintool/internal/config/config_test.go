package eipconfig

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadExampleYAML(t *testing.T) {
	t.Parallel()
	path := filepath.Clean(filepath.Join("..", "kit", "templates", "eip.config.yaml"))
	cfg, err := LoadYAML(path)
	if err != nil {
		t.Fatalf("load example: %v", err)
	}
	if cfg.Services["worker"].Concurrency != 50 {
		t.Fatalf("worker.concurrency=%d", cfg.Services["worker"].Concurrency)
	}
}

func TestSyncEnvStable(t *testing.T) {
	t.Parallel()
	cfg, err := LoadYAML(filepath.Clean(filepath.Join("..", "kit", "templates", "eip.config.yaml")))
	if err != nil {
		t.Fatal(err)
	}
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
}
