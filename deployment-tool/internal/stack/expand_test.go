package stack

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/compose-spec/compose-go/v2/types"
)

func TestExpandGuards(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	cases := []struct {
		name string
		opts Opts
		sub  string
	}{
		{"empty home", Opts{Source: "live", StackFiles: []string{"a.yml"}}, "empty home"},
		{"no files", Opts{Home: "/tmp", Source: "live"}, "no stack files"},
		{"bad source", Opts{Home: "/tmp", Source: "mixed", StackFiles: []string{"a.yml"}}, "live or dev"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := Expand(ctx, tc.opts)
			if err == nil || !strings.Contains(err.Error(), tc.sub) {
				t.Fatalf("got %v, want substring %q", err, tc.sub)
			}
		})
	}
}

func TestExpandInterpolatesAndStamps(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("APP_VERSION=1.2.3\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stack := `
services:
  api:
    image: ghcr.io/example/api:${APP_VERSION}
    secrets:
      - MONGO_PASSWORD
    deploy:
      labels:
        traefik.enable: "true"
  worker:
    image: ghcr.io/example/worker:${APP_VERSION}
secrets:
  MONGO_PASSWORD:
    external: true
configs:
  cfg:
    file: ./cfg.yml
`
	if err := os.WriteFile(filepath.Join(home, "docker-stack.yml"), []byte(stack), 0o644); err != nil {
		t.Fatal(err)
	}

	path, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"docker-stack.yml"},
		Source:     "dev",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if strings.Contains(text, "${APP_VERSION}") {
		t.Fatalf("APP_VERSION not interpolated:\n%s", text)
	}
	if !strings.Contains(text, "ghcr.io/example/api:1.2.3") {
		t.Fatalf("missing interpolated image:\n%s", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "name:") {
		t.Fatalf("project name should be stripped:\n%s", text)
	}
	if strings.Contains(text, "MONGO_PASSWORD") {
		t.Fatalf("secrets should be stripped:\n%s", text)
	}
	if strings.Contains(text, "file: ./cfg.yml") || strings.Contains(text, "\nconfigs:") {
		t.Fatalf("top-level configs should be stripped:\n%s", text)
	}
	if strings.Count(text, "eip.deploy.source") < 2 {
		t.Fatalf("expected deploy source on both services:\n%s", text)
	}
	if !strings.Contains(text, "traefik.enable") {
		t.Fatalf("existing label lost:\n%s", text)
	}
	// Source value is stamped (map form: key then value on same or next tokens).
	if !strings.Contains(text, "eip.deploy.source: dev") && !strings.Contains(text, "eip.deploy.source: \"dev\"") {
		t.Fatalf("missing source=dev stamp:\n%s", text)
	}
}

func TestExpandEnvOverlayWinsOverDotEnv(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("APP_VERSION=from-dotenv\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stack := `
services:
  api:
    image: img:${APP_VERSION}
`
	if err := os.WriteFile(filepath.Join(home, "stack.yml"), []byte(stack), 0o644); err != nil {
		t.Fatal(err)
	}
	path, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"stack.yml"},
		Source:     "live",
		Env:        map[string]string{"APP_VERSION": "from-overlay"},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "img:from-overlay") {
		t.Fatalf("overlay should win:\n%s", raw)
	}
}

func TestExpandMultipleInMemoryRewrites(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("X=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Two files with obs-style configs force two in-memory rewrites.
	a := `
configs:
  prometheus_yml:
    file: ./observability/prometheus/prometheus.yml
services:
  a:
    image: a:1
`
	b := `
configs:
  loki_yml:
    file: ./observability/loki/config.yaml
services:
  b:
    image: b:1
`
	if err := os.WriteFile(filepath.Join(home, "a.yml"), []byte(a), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "b.yml"), []byte(b), 0o644); err != nil {
		t.Fatal(err)
	}
	path, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"a.yml", "b.yml"},
		Source:     "live",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "image: a:1") || !strings.Contains(text, "image: b:1") {
		t.Fatalf("merged services missing:\n%s", text)
	}
	if strings.Contains(text, "observability/") {
		t.Fatalf("obs file configs should be stripped after externalize:\n%s", text)
	}
}

func TestPrepareProjectForStack(t *testing.T) {
	t.Parallel()
	p := &types.Project{
		Name: "eip",
		Configs: types.Configs{
			"cfg": {Name: "cfg"},
		},
		Secrets: types.Secrets{
			"s": {Name: "s"},
		},
		Services: types.Services{
			"api": {
				Image:   "x",
				Secrets: []types.ServiceSecretConfig{{Source: "s"}},
				Deploy: &types.DeployConfig{
					Labels: types.Labels{"traefik.enable": "true"},
				},
			},
			"worker": {Image: "y"},
		},
	}
	prepareProjectForStack(p, "live")
	if p.Name != "" || p.Configs != nil || p.Secrets != nil {
		t.Fatalf("top-level not cleared: name=%q configs=%v secrets=%v", p.Name, p.Configs, p.Secrets)
	}
	if len(p.Services["api"].Secrets) != 0 {
		t.Fatalf("service secrets remain: %#v", p.Services["api"].Secrets)
	}
	if p.Services["api"].Deploy.Labels[LabelDeploySource] != "live" {
		t.Fatalf("api labels: %#v", p.Services["api"].Deploy.Labels)
	}
	if p.Services["api"].Deploy.Labels["traefik.enable"] != "true" {
		t.Fatalf("traefik label lost")
	}
	if p.Services["worker"].Deploy == nil || p.Services["worker"].Deploy.Labels[LabelDeploySource] != "live" {
		t.Fatalf("worker stamp missing: %#v", p.Services["worker"].Deploy)
	}
}

func TestExpandWikiHostAndCompatTag(t *testing.T) {
	home := t.TempDir()
	stack := `
services:
  wiki:
    image: ghcr.io/example/wiki:${WIKI_COMPAT_TAG}
    deploy:
      labels:
        - "traefik.http.routers.wiki.rule=Host(` + "`wiki.${EIP_WIKI_HOST}`" + `)"
`
	if err := os.WriteFile(filepath.Join(home, "stack.yml"), []byte(stack), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".env"), []byte("APP_VERSION=2.4.1\nEVE_CALLBACK_URL=https://shop.example/cb\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	path, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"stack.yml"},
		Source:     "live",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "ghcr.io/example/wiki:2.4") {
		t.Fatalf("compat tag not interpolated:\n%s", text)
	}
	if strings.Contains(text, "2.4.1") {
		t.Fatalf("full semver should not be the wiki tag:\n%s", text)
	}
	if !strings.Contains(text, "wiki.shop.example") {
		t.Fatalf("wiki host not interpolated:\n%s", text)
	}

	if _, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"stack.yml"},
		Source:     "live",
		Env:        map[string]string{"EVE_CALLBACK_URL": ""},
	}); err == nil {
		t.Fatal("live expand without callback host should fail")
	}

	path, err = Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"stack.yml"},
		Source:     "dev",
		Env:        map[string]string{"EVE_CALLBACK_URL": ""},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	raw, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "wiki.localhost") {
		t.Fatalf("dev host:\n%s", raw)
	}
}

func TestExpandEscapesLiteralDollarsForStackDeploy(t *testing.T) {
	home := t.TempDir()
	stack := `
services:
  api:
    image: img:1
    deploy:
      labels:
        - "traefik.http.middlewares.cors.headers.accessControlAllowOriginListRegex=^https://example.com$$"
`
	if err := os.WriteFile(filepath.Join(home, "stack.yml"), []byte(stack), 0o644); err != nil {
		t.Fatal(err)
	}
	path, err := Expand(context.Background(), Opts{
		Home:       home,
		StackFiles: []string{"stack.yml"},
		Source:     "live",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(path)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	// compose-go turns $$ → $; we re-escape so docker stack deploy sees $$.
	if !strings.Contains(text, "example.com$$") {
		t.Fatalf("literal $ not re-escaped for stack deploy:\n%s", text)
	}
}

func TestEscapeDollarsForStackDeploy(t *testing.T) {
	t.Parallel()
	got := escapeDollarsForStackDeploy(`^https://eveindustryplanner.com$`)
	if got != `^https://eveindustryplanner.com$$` {
		t.Fatalf("got %q", got)
	}
}

func TestPublishedQuotedUnquote(t *testing.T) {
	t.Parallel()
	in := "    published: \"27017\"\n"
	out := publishedQuoted.ReplaceAllString(in, `${1}$2`)
	if out != "    published: 27017\n" {
		t.Fatalf("%q", out)
	}
}

func TestNormalizeModeNumbers(t *testing.T) {
	t.Parallel()
	in := "              mode: \"0755\"\n"
	out := normalizeModeNumbers(in)
	if out != "              mode: 493\n" {
		t.Fatalf("%q", out)
	}
	if got := normalizeModeNumbers("              mode: 493\n"); got != "              mode: 493\n" {
		t.Fatalf("%q", got)
	}
}
