package stack

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPrepareComposeSourcesInMemory(t *testing.T) {
	home := t.TempDir()
	raw := []byte(`
configs:
  prometheus_yml:
    file: ./observability/prometheus/prometheus.yml
services:
  mongo:
    image: mongo:8
    volumes:
      - type: bind
        source: ./mongo-keyfile
        target: /etc/mongo-keyfile
      - mongo_data:/data/db
`)
	src := filepath.Join(home, "docker-stack.data.yml")
	if err := os.WriteFile(src, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	sources, err := prepareComposeSources(home, []string{"docker-stack.data.yml"})
	if err != nil {
		t.Fatal(err)
	}
	if len(sources) != 1 || sources[0].Path != src || len(sources[0].YAML) == 0 {
		t.Fatalf("want path+YAML rewrite: %#v", sources)
	}
	got := string(sources[0].YAML)
	if strings.Contains(got, "observability/prometheus") {
		t.Fatalf("obs file path should be stubbed:\n%s", got)
	}
	wantBind := filepath.Join(home, "mongo-keyfile")
	if !strings.Contains(got, wantBind) {
		t.Fatalf("want absolute bind %q in:\n%s", wantBind, got)
	}
	if strings.Contains(got, "source: ./mongo-keyfile") {
		t.Fatalf("relative bind should be absoluteized:\n%s", got)
	}
}

func TestPrepareComposeSourcesUnchangedPath(t *testing.T) {
	home := t.TempDir()
	raw := []byte(`
services:
  api:
    image: x
`)
	src := filepath.Join(home, "docker-stack.yml")
	if err := os.WriteFile(src, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	sources, err := prepareComposeSources(home, []string{"docker-stack.yml"})
	if err != nil {
		t.Fatal(err)
	}
	if len(sources) != 1 || sources[0].Path != src || string(sources[0].YAML) != string(raw) {
		t.Fatalf("want unchanged bytes: %#v", sources[0])
	}
}

func TestAbsoluteBindSourcePathStyles(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		home string
		src  string
		want string
		ok   bool
	}{
		{"unix rel", filepath.FromSlash("/home/op/eip"), "./mongo-keyfile", filepath.Join(filepath.FromSlash("/home/op/eip"), "mongo-keyfile"), true},
		{"unix parent", filepath.FromSlash("/home/op/eip"), "../shared/key", filepath.Clean(filepath.Join(filepath.FromSlash("/home/op/eip"), "../shared/key")), true},
		{"named volume", filepath.FromSlash("/home/op/eip"), "mongo_data", "", false},
		{"already abs unix", filepath.FromSlash("/home/op/eip"), filepath.FromSlash("/abs/mongo-keyfile"), "", false},
		{"dot", filepath.FromSlash("/home/op/eip"), ".", filepath.Clean(filepath.FromSlash("/home/op/eip")), true},
	}
	if runtime.GOOS == "windows" {
		cases = append(cases,
			struct {
				name string
				home string
				src  string
				want string
				ok   bool
			}{"windows rel", `C:\Users\op\eip`, "./mongo-keyfile", filepath.Join(`C:\Users\op\eip`, "mongo-keyfile"), true},
			struct {
				name string
				home string
				src  string
				want string
				ok   bool
			}{"windows abs", `C:\Users\op\eip`, `C:\Users\op\eip\mongo-keyfile`, "", false},
		)
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, ok := absoluteBindSource(tc.home, tc.src)
			if ok != tc.ok || got != tc.want {
				t.Fatalf("got (%q,%v) want (%q,%v)", got, ok, tc.want, tc.ok)
			}
		})
	}
}

func TestAbsoluteizeRelativeBindSources(t *testing.T) {
	home := t.TempDir()
	in := []byte(`
services:
  mongo:
    volumes:
      - type: bind
        source: ./mongo-keyfile
        target: /etc/mongo-keyfile
      - type: volume
        source: mongo_data
        target: /data/db
      - type: bind
        source: /already/abs
        target: /x
`)
	out, err := absoluteizeRelativeBindSources(home, in)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	want := filepath.Join(home, "mongo-keyfile")
	if !strings.Contains(s, want) {
		t.Fatalf("missing %q in:\n%s", want, s)
	}
	if strings.Contains(s, "source: ./mongo-keyfile") {
		t.Fatalf("still relative:\n%s", s)
	}
	if !strings.Contains(s, "mongo_data") {
		t.Fatalf("named volume lost:\n%s", s)
	}
	if !strings.Contains(s, "/already/abs") {
		t.Fatalf("abs bind lost:\n%s", s)
	}
}

func TestExternalizeObservabilityConfigs(t *testing.T) {
	in := `
configs:
  loki_yml:
    file: ./observability/loki/config.yaml
  other:
    file: ./local.yml
services:
  loki:
    image: x
`
	out, changed, err := externalizeObservabilityConfigs([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	if !changed {
		t.Fatal("expected change")
	}
	s := string(out)
	if strings.Contains(s, "observability/loki") {
		t.Fatalf("still has file path:\n%s", s)
	}
	if !strings.Contains(s, "eip_pending_loki_yml") {
		t.Fatalf("missing pending name:\n%s", s)
	}
	if !strings.Contains(s, "./local.yml") {
		t.Fatalf("non-obs file should remain:\n%s", s)
	}
}
