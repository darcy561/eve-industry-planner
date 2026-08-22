package stack

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestLoadExternalsAndRepos(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	mustWrite(t, path, `
services:
  api:
    image: eve-industry-planner-api:${TAG_api}
networks:
  eip-core:
    name: eip-core
    external: true
  eip-public:
    name: eip-public
    driver: overlay
volumes:
  api_data:
    name: eve-industry-planner_api_data
    external: true
  capacity_config:
    name: eve-industry-planner_capacity_config
`)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	nets := ExternalNetworks(doc)
	vols := ExternalVolumes(doc)
	repos := ImageRepos(doc)
	if !slices.Contains(nets, "eip-core") || len(nets) != 1 {
		t.Fatalf("nets: %v", nets)
	}
	if !slices.Contains(vols, "eve-industry-planner_api_data") ||
		slices.Contains(vols, "eve-industry-planner_capacity_config") {
		t.Fatalf("vols: %v", vols)
	}
	if repos["api"] != "eve-industry-planner-api" {
		t.Fatalf("repos: %v", repos)
	}
}

func TestConfigMountsAndSyncTargets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	mustWrite(t, path, `
services:
  a:
    configs:
      - source: shared
        target: /a.yml
    deploy:
      labels:
        - "eip.config.sync=1"
  b:
    configs:
      - source: shared
        target: /b.yml
      - source: cfg_b
        target: /only-b.yml
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
  shared:
    file: ./shared.yml
  cfg_b:
    file: ./b.yml
  cfg_c:
    file: ./c.yml
`)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	mounts, err := ConfigMounts(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(mounts) != 3 {
		t.Fatalf("mounts %#v", mounts)
	}
	if mounts[0].Service != "a" || mounts[0].Target != "/a.yml" || mounts[0].Key != "shared" {
		t.Fatalf("mounts[0] %#v", mounts[0])
	}
	uniq, err := ConfigSyncTargets(doc)
	if err != nil {
		t.Fatal(err)
	}
	if len(uniq) != 2 || uniq[0].Key != "shared" || uniq[1].Key != "cfg_b" {
		t.Fatalf("uniq %#v", uniq)
	}
}

func TestTraefikApplySurfaceFromDoc(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	bt := "`"
	body := `
services:
  traefik:
    ports:
      - target: 80
        published: ${EIP_HTTP_PORT:-80}
        protocol: tcp
        mode: ingress
      - target: 443
        published: "${EIP_HTTPS_PORT:-443}"
        protocol: tcp
        mode: ingress
      - target: 81
        published: ${EIP_TRAEFIK_DASHBOARD_PORT:-81}
        protocol: tcp
        mode: ingress
    deploy:
      labels:
        - "traefik.http.routers.traefik-dashboard.rule=PathPrefix(` + bt + `${EIP_TRAEFIK_DASHBOARD_PATH:-/dashboard}` + bt + `) || PathPrefix(` + bt + `/api` + bt + `)"
`
	mustWrite(t, path, body)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got, err := TraefikApplySurfaceFromDoc(doc)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTP.Target != 80 || got.HTTPS.Target != 443 || got.Dashboard.Target != 81 {
		t.Fatalf("targets %#v", got)
	}
	if got.HTTP.Protocol != "tcp" || got.HTTP.Mode != "ingress" {
		t.Fatalf("publish meta %#v", got.HTTP)
	}
	wantRule := "PathPrefix(`/ops`) || PathPrefix(`/api`)"
	if rule := SubstituteEnv(got.DashboardRule, "EIP_TRAEFIK_DASHBOARD_PATH", "/ops"); rule != wantRule {
		t.Fatalf("rule=%q want %q", rule, wantRule)
	}
}

func TestGrafanaApplySurfaceFromDoc(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	bt := "`"
	body := `
services:
  grafana:
    environment:
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL:-http://127.0.0.1/grafana/}
    deploy:
      labels:
        - "traefik.http.routers.grafana.rule=PathPrefix(` + bt + `${EIP_GRAFANA_PATH:-/grafana}` + bt + `)"
`
	mustWrite(t, path, body)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got, err := GrafanaApplySurfaceFromDoc(doc)
	if err != nil {
		t.Fatal(err)
	}
	root := DesiredGrafanaRootURL(got, "/ops")
	if root != "http://127.0.0.1/ops/" {
		t.Fatalf("root=%q", root)
	}
	if rule := SubstituteEnv(got.TraefikRule, "EIP_GRAFANA_PATH", "/ops"); rule != "PathPrefix(`/ops`)" {
		t.Fatalf("rule=%q", rule)
	}
}

func TestTraefikApplySurfaceRepoStack(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	doc, err := Load(filepath.Join(root, "docker-stack.yml"))
	if err != nil {
		t.Fatal(err)
	}
	got, err := TraefikApplySurfaceFromDoc(doc)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTP.Target < 1 || got.DashboardRule == "" {
		t.Fatalf("%#v", got)
	}
}

func TestGrafanaApplySurfaceRepoObsStack(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	doc, err := Load(filepath.Join(root, "docker-stack.obs.yml"))
	if err != nil {
		t.Fatal(err)
	}
	got, err := GrafanaApplySurfaceFromDoc(doc)
	if err != nil {
		t.Fatal(err)
	}
	if got.RootURLEnv == "" || got.TraefikRule == "" {
		t.Fatalf("%#v", got)
	}
	if got.TraefikLabels["traefik.enable"] != "false" {
		t.Fatalf("want private default enable=false, got %#v", got.TraefikLabels)
	}
	if _, ok := got.TraefikLabels["traefik.http.routers.grafana-secure.entrypoints"]; !ok {
		t.Fatalf("missing websecure router template: %#v", got.TraefikLabels)
	}
}

func TestCapacityTargets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	mustWrite(t, path, `
services:
  api:
    deploy:
      labels:
        - "eip.capacity.sync=1"
        - "eip.capacity.service=api"
  websocket:
    deploy:
      labels:
        eip.capacity.sync: "1"
        eip.capacity.service: websocket
  ws-router:
    deploy:
      labels:
        - "eip.capacity.min=1"
        - "eip.capacity.max=2"
  worker:
    deploy:
      labels:
        - "eip.capacity.sync=1"
`)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got := CapacityTargets(doc, "eip")
	if len(got) != 3 {
		t.Fatalf("got %#v", got)
	}
	if got[0].YAMLKey != "api" || got[0].SwarmService != "eip_api" {
		t.Fatalf("api %#v", got[0])
	}
	if got[2].YAMLKey != "worker" || got[2].SwarmService != "eip_worker" {
		t.Fatalf("worker %#v", got[2])
	}
}

func TestSecretAttaches(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "yml")
	mustWrite(t, path, `
x-secrets: &sec
  - MONGO_PASSWORD
  - source: REDIS_PASSWORD
services:
  api:
    secrets: *sec
  worker:
    secrets:
      - ENTITY_ID_KEY
`)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got := SecretAttaches(doc)
	want := map[string][]string{
		"api":    {"MONGO_PASSWORD", "REDIS_PASSWORD"},
		"worker": {"ENTITY_ID_KEY"},
	}
	bySvc := map[string][]string{}
	for _, a := range got {
		bySvc[a.Service] = append(bySvc[a.Service], a.Key)
	}
	for svc, keys := range want {
		if len(bySvc[svc]) != len(keys) {
			t.Fatalf("%s: got %v want %v", svc, bySvc[svc], keys)
		}
		for i, k := range keys {
			if bySvc[svc][i] != k {
				t.Fatalf("%s[%d]=%q want %q", svc, i, bySvc[svc][i], k)
			}
		}
	}
}

func mustWrite(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}
