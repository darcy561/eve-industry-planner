package stack

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInjectSecrets(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "app.yml")
	body := `
services:
  api:
    image: api:1
  frontend:
    image: fe:1
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	err := InjectSecrets(path,
		map[string]string{"MONGO_PASSWORD": "eip_MONGO_PASSWORD_abc"},
		map[string][]string{"api": {"MONGO_PASSWORD"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "secrets:") || !strings.Contains(text, "eip_MONGO_PASSWORD_abc") {
		t.Fatalf("top-level secrets missing:\n%s", text)
	}
	if !strings.Contains(text, "MONGO_PASSWORD") {
		t.Fatalf("service attach missing:\n%s", text)
	}
}

func TestInjectPreservesEscapedDollars(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "app.yml")
	// Post-Expand form: literal $ already re-escaped as $$ for stack deploy.
	body := `
services:
  api:
    image: api:1
    deploy:
      labels:
        traefik.http.middlewares.cors.headers.accessControlAllowOriginListRegex: "^https://example.com$$"
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := InjectSecrets(path,
		map[string]string{"MONGO_PASSWORD": "eip_MONGO_PASSWORD_abc"},
		map[string][]string{"api": {"MONGO_PASSWORD"}},
	); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if !strings.Contains(text, "example.com$$") {
		t.Fatalf("inject remarshal dropped $$ escape:\n%s", text)
	}
}

func TestInjectExternalConfigs(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "obs.yml")
	body := `
services:
  grafana:
    image: grafana:1
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := InjectExternalConfigs(path, nil); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), "configs:") {
		t.Fatalf("empty map should be no-op:\n%s", raw)
	}
	err := InjectExternalConfigs(path, map[string]string{
		"prometheus_yml": "eip_prometheus_yml_deadbeef0001",
		"alloy_config":   "eip_alloy_config_deadbeef0002",
	})
	if err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	for _, want := range []string{
		"configs:",
		"prometheus_yml:",
		"eip_prometheus_yml_deadbeef0001",
		"alloy_config:",
		"external: true",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q in:\n%s", want, text)
		}
	}
}
