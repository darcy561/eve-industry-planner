package config

import (
	"strings"
	"testing"

	"eve-industry-planner/deployment-tool/internal/stack"
)

func TestDiffServiceNoop(t *testing.T) {
	t.Parallel()
	desire := DesiredService{
		SwarmService: "eip_websocket",
		Replicas:     2,
		CapacityMin:  "2",
		CapacityMax:  "4",
		Env:          map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000"},
	}
	live := LiveService{
		Replicas:    2,
		CapacityMin: "2",
		CapacityMax: "4",
		Env:         map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000", "OTHER": "x"},
	}
	if ch := DiffService(live, desire); len(ch) != 0 {
		t.Fatalf("want no changes, got %#v", ch)
	}
}

func TestDiffServiceEnvAndLabel(t *testing.T) {
	t.Parallel()
	desire := DesiredService{
		SwarmService: "eip_websocket",
		Replicas:     2,
		CapacityMin:  "2",
		CapacityMax:  "4",
		Env:          map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000"},
	}
	live := LiveService{
		Replicas:    2,
		CapacityMin: "2",
		CapacityMax: "12",
		Env:         map[string]string{"WS_SLOT_CLIENT_CUTOFF": "1"},
	}
	ch := DiffService(live, desire)
	if len(ch) != 2 {
		t.Fatalf("got %#v", ch)
	}
}

func TestDiffTraefikNoop(t *testing.T) {
	t.Parallel()
	surface := stack.TraefikApplySurface{
		HTTP:             stack.TraefikPublishPort{Target: 80, Protocol: "tcp", Mode: "ingress"},
		HTTPS:            stack.TraefikPublishPort{Target: 443, Protocol: "tcp", Mode: "ingress"},
		Dashboard:        stack.TraefikPublishPort{Target: 81, Protocol: "tcp", Mode: "ingress"},
		DashboardRuleKey: "traefik.http.routers.traefik-dashboard.rule",
		DashboardRule:    "PathPrefix(`${EIP_TRAEFIK_DASHBOARD_PATH:-/dashboard}`) || PathPrefix(`/api`)",
	}
	desire := DesiredTraefikFromConfig(Config{}, surface)
	desire.HTTPPort, desire.HTTPSPort, desire.DashboardPort = 80, 443, 81
	desire.DashboardPath = "/dashboard"
	desire.DashboardRule = stack.SubstituteEnv(surface.DashboardRule, "EIP_TRAEFIK_DASHBOARD_PATH", "/dashboard")
	live := LiveTraefik{
		PublishedByTarget: map[uint32]uint32{80: 80, 443: 443, 81: 81},
		DashboardRule:     desire.DashboardRule,
	}
	if ch := DiffTraefik(live, desire); len(ch) != 0 {
		t.Fatalf("want no changes, got %#v", ch)
	}
}

func TestDiffTraefikPublishAndPath(t *testing.T) {
	t.Parallel()
	surface := stack.TraefikApplySurface{
		HTTP:             stack.TraefikPublishPort{Target: 80, Protocol: "tcp", Mode: "ingress"},
		HTTPS:            stack.TraefikPublishPort{Target: 443, Protocol: "tcp", Mode: "ingress"},
		Dashboard:        stack.TraefikPublishPort{Target: 81, Protocol: "tcp", Mode: "ingress"},
		DashboardRuleKey: "traefik.http.routers.traefik-dashboard.rule",
		DashboardRule:    "PathPrefix(`${EIP_TRAEFIK_DASHBOARD_PATH:-/dashboard}`) || PathPrefix(`/api`)",
	}
	desire := DesiredTraefik{
		Surface:       surface,
		HTTPPort:      8080,
		HTTPSPort:     8443,
		DashboardPort: 8081,
		DashboardPath: "/tf",
		DashboardRule: stack.SubstituteEnv(surface.DashboardRule, "EIP_TRAEFIK_DASHBOARD_PATH", "/tf"),
	}
	live := LiveTraefik{
		PublishedByTarget: map[uint32]uint32{80: 80, 443: 443, 81: 81},
		DashboardRule:     stack.SubstituteEnv(surface.DashboardRule, "EIP_TRAEFIK_DASHBOARD_PATH", "/dashboard"),
	}
	ch := DiffTraefik(live, desire)
	if len(ch) != 4 {
		t.Fatalf("want 4 changes, got %#v", ch)
	}
}

func TestGrafanaPathNeedsApply(t *testing.T) {
	t.Parallel()
	live := LiveGrafana{
		Running:       true,
		RootURL:       "http://127.0.0.1/grafana/",
		PathFromLabel: "/grafana",
	}
	if GrafanaPathNeedsApply(live, "/grafana", "http://127.0.0.1/grafana/") {
		t.Fatal("want no apply")
	}
	if !GrafanaPathNeedsApply(live, "/ops", "http://127.0.0.1/ops/") {
		t.Fatal("want apply for path change")
	}
	if GrafanaPathNeedsApply(LiveGrafana{Running: false}, "/ops", "http://127.0.0.1/ops/") {
		t.Fatal("want skip when not running")
	}
}

func TestDesiredGrafanaLabels(t *testing.T) {
	t.Parallel()
	surface := stack.GrafanaApplySurface{
		TraefikEnableKey: "traefik.enable",
		TraefikLabels: map[string]string{
			"traefik.enable":                    "false",
			"traefik.swarm.network":             "eip-public",
			"traefik.http.routers.grafana.rule": "PathPrefix(`${EIP_GRAFANA_PATH:-/grafana}`)",
		},
	}
	pub := DesiredGrafanaLabels(surface, "/ops", "eip-public", true)
	if pub["traefik.enable"] != "true" {
		t.Fatalf("enable=%q", pub["traefik.enable"])
	}
	if pub["traefik.swarm.network"] != "eip-public" {
		t.Fatalf("network=%q", pub["traefik.swarm.network"])
	}
	if !strings.Contains(pub["traefik.http.routers.grafana.rule"], "/ops") {
		t.Fatalf("rule=%q", pub["traefik.http.routers.grafana.rule"])
	}
	priv := DesiredGrafanaLabels(surface, "/ops", "eip-public", false)
	if priv["traefik.enable"] != "false" {
		t.Fatalf("private enable=%q", priv["traefik.enable"])
	}
	if _, ok := priv["traefik.http.routers.grafana.rule"]; !ok {
		t.Fatal("private keeps router template labels")
	}
}

func TestMergeStringMapKeepsOtherLabels(t *testing.T) {
	t.Parallel()
	labels := map[string]string{
		"traefik.enable":                    "true",
		"traefik.http.routers.grafana.rule": "PathPrefix(`/grafana`)",
		"eip.config.sync":                   "1",
	}
	mergeStringMap(labels, map[string]string{
		"traefik.enable":                    "false",
		"traefik.http.routers.grafana.rule": "PathPrefix(`/ops`)",
	})
	if labels["traefik.enable"] != "false" {
		t.Fatalf("%v", labels)
	}
	if labels["traefik.http.routers.grafana.rule"] != "PathPrefix(`/ops`)" {
		t.Fatalf("templates updated in place: %v", labels)
	}
	if labels["eip.config.sync"] != "1" {
		t.Fatal("non-traefik labels must remain")
	}
}

func TestGrafanaLabelsDirty(t *testing.T) {
	t.Parallel()
	live := LiveGrafana{
		Running:       true,
		TraefikEnable: "false",
		Labels:        map[string]string{"traefik.enable": "false"},
	}
	wantPriv := map[string]string{"traefik.enable": "false"}
	if grafanaLabelsDirty(live, false, wantPriv) {
		t.Fatal("private unchanged should be clean")
	}
	if !grafanaLabelsDirty(live, true, map[string]string{"traefik.enable": "true"}) {
		t.Fatal("want dirty when enabling public")
	}
}

func TestDesiredFromConfigEnvGating(t *testing.T) {
	t.Parallel()
	cfg := Config{
		Version: 1,
		Services: map[string]ServiceSpec{
			"api":       {Min: 1, Max: 2},
			"worker":    {Min: 1, Max: 2, Concurrency: 12},
			"websocket": {Min: 2, Max: 4, ClientCutoff: 99, TargetClients: 50},
		},
	}
	doc := stack.Doc{
		Services: map[string]stack.Service{
			"api": {},
			"worker": {
				Environment: stack.ServiceEnv{stack.EnvWorkerAsynqConcurrency: "1"},
			},
			"websocket": {}, // no WS_SLOT_* → env omitted
		},
	}
	targets := []stack.CapacityTarget{
		{Service: "api", YAMLKey: "api", SwarmService: "eip_api"},
		{Service: "worker", YAMLKey: "worker", SwarmService: "eip_worker"},
		{Service: "websocket", YAMLKey: "websocket", SwarmService: "eip_websocket"},
		{Service: "ghost", YAMLKey: "missing", SwarmService: "eip_ghost"}, // skip: no YAML key
	}
	got := cfg.DesiredFromConfig(targets, doc)
	if len(got) != 3 {
		t.Fatalf("want 3 (skip missing YAML), got %#v", got)
	}
	by := map[string]DesiredService{}
	for _, d := range got {
		by[d.SwarmService] = d
	}
	if len(by["eip_api"].Env) != 0 {
		t.Fatalf("api env: %#v", by["eip_api"].Env)
	}
	if by["eip_worker"].Env[stack.EnvWorkerAsynqConcurrency] != "12" {
		t.Fatalf("worker env: %#v", by["eip_worker"].Env)
	}
	if len(by["eip_websocket"].Env) != 0 {
		t.Fatalf("websocket should omit undeclared cutoff/target: %#v", by["eip_websocket"].Env)
	}
	if by["eip_websocket"].Replicas != 2 || by["eip_websocket"].CapacityMax != "4" {
		t.Fatalf("websocket capacity: %#v", by["eip_websocket"])
	}

	doc.Services["websocket"] = stack.Service{
		Environment: stack.ServiceEnv{
			stack.EnvWSSlotClientCutoff:  "2000",
			stack.EnvWSSlotTargetClients: "1500",
		},
	}
	got = cfg.DesiredFromConfig(targets, doc)
	by = map[string]DesiredService{}
	for _, d := range got {
		by[d.SwarmService] = d
	}
	env := by["eip_websocket"].Env
	if env[stack.EnvWSSlotClientCutoff] != "99" || env[stack.EnvWSSlotTargetClients] != "50" {
		t.Fatalf("websocket env when declared: %#v", env)
	}
}
