package swarm

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverFromObsStack(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	path := filepath.Join(root, "docker-stack.obs.yml")
	got, err := DiscoverConfigs(path)
	if err != nil {
		t.Fatal(err)
	}
	byKey := map[string]string{}
	for _, tget := range got {
		byKey[tget.Key] = tget.File
	}
	want := "observability/prometheus/prometheus.yml"
	if byKey["prometheus_yml"] != want {
		t.Fatalf("prometheus_yml=%q want %q (keys=%v)", byKey["prometheus_yml"], want, byKey)
	}
}

func TestDiscoverFromAppStackIncludesEIPConfig(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	path := filepath.Join(root, "docker-stack.yml")
	got, err := DiscoverConfigs(path)
	if err != nil {
		t.Fatal(err)
	}
	byKey := map[string]string{}
	for _, tget := range got {
		byKey[tget.Key] = tget.File
	}
	if byKey["eip_config_yaml"] != "eip.config.yaml" && byKey["eip_config_yaml"] != "./eip.config.yaml" {
		t.Fatalf("eip_config_yaml=%q keys=%v", byKey["eip_config_yaml"], byKey)
	}
}

func TestDiscoverListAndMapLabels(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "stack.yml")
	content := `
services:
  a:
    configs:
      - source: cfg_a
        target: /a.yml
    deploy:
      labels:
        - "eip.config.sync=1"
  b:
    configs:
      - source: cfg_b
        target: /b.yml
    deploy:
      labels:
        eip.config.sync: "true"
  c:
    configs:
      - source: cfg_c
        target: /c.yml
    deploy:
      labels:
        - "eip.config.sync=0"
configs:
  cfg_a:
    file: ./a.yml
  cfg_b:
    file: ./b.yml
  cfg_c:
    file: ./c.yml
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := DiscoverConfigs(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %#v", got)
	}
	if got[0].Key != "cfg_a" || got[1].Key != "cfg_b" {
		t.Fatalf("order/keys %#v", got)
	}
}
