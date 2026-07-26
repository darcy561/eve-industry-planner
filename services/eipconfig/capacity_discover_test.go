package eipconfig_test

import (
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/eipconfig"
)

func TestDiscoverCapacitySyncTargetsFixture(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "stack.yml")
	content := `
services:
  api:
    deploy:
      labels:
        - "eip.capacity.service=api"
        - "eip.capacity.sync=1"
  websocket:
    deploy:
      labels:
        - "eip.capacity.service=websocket"
        - "eip.capacity.sync=1"
  ws-router:
    deploy:
      labels:
        - "eip.capacity.service=ws-router"
        - "eip.capacity.min=1"
  worker:
    deploy:
      labels:
        - "eip.capacity.sync=1"
        - "eip.capacity.service=worker"
  seaweedfs:
    image: x
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := eipconfig.DiscoverCapacitySyncTargets(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("want 3 targets, got %#v", got)
	}
	want := []eipconfig.ApplyTarget{
		{YAMLKey: "api", SwarmService: "eip_api"},
		{YAMLKey: "websocket", SwarmService: "eip_websocket"},
		{YAMLKey: "worker", SwarmService: "eip_worker"},
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("[%d] got %#v want %#v", i, got[i], want[i])
		}
	}
}

func TestDiscoverCapacitySyncTargetsRepoStack(t *testing.T) {
	t.Parallel()
	root := filepath.Join("..", "..")
	path := filepath.Join(root, "docker-stack.yml")
	if _, err := os.Stat(path); err != nil {
		t.Skip("docker-stack.yml not found")
	}
	got, err := eipconfig.DiscoverCapacitySyncTargets(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("want api/websocket/worker, got %#v", got)
	}
	keys := map[string]bool{}
	for _, tgt := range got {
		keys[tgt.YAMLKey] = true
	}
	for _, k := range []string{"api", "websocket", "worker"} {
		if !keys[k] {
			t.Fatalf("missing %s in %#v", k, got)
		}
	}
	if keys["ws-router"] {
		t.Fatal("ws-router must not have capacity.sync")
	}
}

func TestDiscoverConfigSyncTargetsRepoDataStack(t *testing.T) {
	t.Parallel()
	root := filepath.Join("..", "..")
	path := filepath.Join(root, "docker-stack.data.yml")
	if _, err := os.Stat(path); err != nil {
		t.Skip("docker-stack.data.yml not found")
	}
	got, err := eipconfig.DiscoverConfigSyncTargets(path)
	if err != nil {
		t.Fatal(err)
	}
	byKey := map[string]eipconfig.ConfigSyncTarget{}
	for _, tgt := range got {
		byKey[tgt.Key] = tgt
	}
	prom, ok := byKey["prometheus_yml"]
	if !ok || prom.Service != "prometheus" {
		t.Fatalf("prometheus_yml: %#v", got)
	}
	if prom.File != "observability/prometheus/prometheus.yml" || prom.Target != "/etc/prometheus/prometheus.yml" {
		t.Fatalf("prometheus_yml fields: %#v", prom)
	}
	if _, ok := byKey["mongo_setup_sh"]; ok {
		t.Fatalf("mongo_setup_sh should be a host bind, not eip.config.sync: %#v", got)
	}
}
