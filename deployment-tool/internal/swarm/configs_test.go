package swarm

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverFromDataStack(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	path := filepath.Join(root, "docker-stack.data.yml")
	got, err := DiscoverConfigs(path)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"prometheus_yml": "observability/prometheus/prometheus.yml",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d targets %#v, want %d", len(got), got, len(want))
	}
	for _, tget := range got {
		file, ok := want[tget.Key]
		if !ok {
			t.Fatalf("unexpected key %q", tget.Key)
		}
		if tget.File != file {
			t.Fatalf("%s: file=%q want %q", tget.Key, tget.File, file)
		}
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
