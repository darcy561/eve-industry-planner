package eipconfig_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/eipconfig"
)

func TestLoadExampleYAML(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", ".."))
	path := filepath.Join(root, "admintool", "internal", "templates", "eip.config.yaml")
	cfg, err := eipconfig.LoadYAML(path)
	if err != nil {
		t.Fatalf("load example: %v", err)
	}
	if cfg.Services["worker"].Concurrency != 50 {
		t.Fatalf("worker.concurrency=%d", cfg.Services["worker"].Concurrency)
	}
	if cfg.Services["websocket"].ClientCutoff != 2000 {
		t.Fatalf("websocket.client_cutoff=%d", cfg.Services["websocket"].ClientCutoff)
	}
	if cfg.Services["websocket"].Max != 4 {
		t.Fatalf("websocket.max=%d want 4", cfg.Services["websocket"].Max)
	}
}

func TestSyncEnvStable(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", ".."))
	cfg, err := eipconfig.LoadYAML(filepath.Join(root, "admintool", "internal", "templates", "eip.config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	lines := cfg.SyncEnv()
	joined := strings.Join(lines, "\n")
	for _, want := range []string{
		"EIP_WEBSOCKET_CAPACITY_MAX=4",
		"EIP_WEBSOCKET_REPLICAS=2",
		"EIP_WORKER_CAPACITY_MAX=2",
		"EIP_API_REPLICAS=1",
		"EIP_HTTP_PORT=80",
		"EIP_HTTPS_PORT=443",
		"EIP_TRAEFIK_DASHBOARD_PORT=81",
		"EIP_GRAFANA_PATH=/grafana",
		"EIP_TRAEFIK_DASHBOARD_PATH=/dashboard",
		"EIP_TRAEFIK_TRUSTED_PROXY_CIDRS=",
		"GRAFANA_ROOT_URL=http://127.0.0.1/grafana/",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("missing %q in:\n%s", want, joined)
		}
	}
}

func TestValidateRejectsBadPort(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
ports:
  http: 99999
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil || !strings.Contains(err.Error(), "ports.http") {
		t.Fatalf("want ports.http error, got %v", err)
	}
}

func TestValidateRejectsBadPath(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
paths:
  grafana: grafana
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil || !strings.Contains(err.Error(), "paths.grafana") {
		t.Fatalf("want paths.grafana error, got %v", err)
	}
}

func TestEffectivePortsPathsDefaults(t *testing.T) {
	t.Parallel()
	cfg := eipconfig.Config{}
	ports := cfg.EffectivePorts()
	if ports.HTTP != 80 || ports.HTTPS != 443 || ports.TraefikDashboard != 81 {
		t.Fatalf("ports defaults: %#v", ports)
	}
	paths := cfg.EffectivePaths()
	if paths.Grafana != "/grafana" || paths.TraefikDashboard != "/dashboard" {
		t.Fatalf("paths defaults: %#v", paths)
	}
}

func TestValidateRejectsBadTrustedCIDR(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
proxy:
  trusted_cidrs:
    - not-a-cidr
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil || !strings.Contains(err.Error(), "proxy.trusted_cidrs") {
		t.Fatalf("want proxy.trusted_cidrs error, got %v", err)
	}
}

func TestValidateRejectsIPInTrustedCIDRs(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
proxy:
  trusted_cidrs:
    - 203.0.113.10
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil || !strings.Contains(err.Error(), "trusted_ips") {
		t.Fatalf("want trusted_ips hint, got %v", err)
	}
}

func TestValidateRejectsBadTrustedIP(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
proxy:
  trusted_ips:
    - 203.0.113.0/24
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil || !strings.Contains(err.Error(), "proxy.trusted_ips") {
		t.Fatalf("want proxy.trusted_ips error, got %v", err)
	}
}

func TestTrustedProxyCIDRsCSV(t *testing.T) {
	t.Parallel()
	cfg := eipconfig.Config{
		Proxy: eipconfig.Proxy{
			TrustedIPs:   []string{" 203.0.113.10 ", "203.0.113.10"},
			TrustedCIDRs: []string{"203.0.113.0/24", "2001:db8::/32"},
		},
	}
	got := cfg.TrustedProxyCIDRsCSV()
	want := "203.0.113.10,203.0.113.0/24,2001:db8::/32"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestValidateRejectsBadConcurrency(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.yaml")
	body := `
version: 1
services:
  worker:
    min: 1
    max: 2
    concurrency: 99
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := eipconfig.LoadYAML(path)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateAllowsMissingAppVersion(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "ok.yaml")
	body := `
version: 1
services:
  worker:
    min: 1
    max: 2
    concurrency: 10
  websocket:
    min: 2
    max: 4
    client_cutoff: 2000
  api:
    min: 1
    max: 6
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := eipconfig.LoadYAML(path); err != nil {
		t.Fatalf("app_version must not be required: %v", err)
	}
}
