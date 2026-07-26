package eipconfig_test

import (
	"testing"

	"eve-industry-planner/eipconfig"
)

func TestDiffServiceNoop(t *testing.T) {
	t.Parallel()
	desire := eipconfig.DesiredService{
		SwarmService: "eip_websocket",
		Replicas:     2,
		CapacityMin:  "2",
		CapacityMax:  "4",
		Env:          map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000"},
	}
	live := eipconfig.LiveService{
		Replicas:    2,
		CapacityMin: "2",
		CapacityMax: "4",
		Env:         map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000", "OTHER": "x"},
	}
	if ch := eipconfig.DiffService(live, desire); len(ch) != 0 {
		t.Fatalf("want no changes, got %#v", ch)
	}
}

func TestDiffServiceEnvAndLabel(t *testing.T) {
	t.Parallel()
	desire := eipconfig.DesiredService{
		SwarmService: "eip_websocket",
		Replicas:     2,
		CapacityMin:  "2",
		CapacityMax:  "4",
		Env:          map[string]string{"WS_SLOT_CLIENT_CUTOFF": "2000"},
	}
	live := eipconfig.LiveService{
		Replicas:    2,
		CapacityMin: "2",
		CapacityMax: "12",
		Env:         map[string]string{"WS_SLOT_CLIENT_CUTOFF": "1"},
	}
	ch := eipconfig.DiffService(live, desire)
	if len(ch) != 2 {
		t.Fatalf("got %#v", ch)
	}
}

func TestDiffTraefikNoop(t *testing.T) {
	t.Parallel()
	desire := eipconfig.DesiredTraefik{
		HTTPPort:      80,
		HTTPSPort:     443,
		DashboardPort: 81,
		DashboardPath: "/dashboard",
		DashboardRule: eipconfig.TraefikDashboardRule("/dashboard"),
	}
	live := eipconfig.LiveTraefik{
		PublishedByTarget: map[uint32]uint32{80: 80, 443: 443, 81: 81},
		DashboardRule:     desire.DashboardRule,
	}
	if ch := eipconfig.DiffTraefik(live, desire); len(ch) != 0 {
		t.Fatalf("want no changes, got %#v", ch)
	}
}

func TestDiffTraefikPublishAndPath(t *testing.T) {
	t.Parallel()
	desire := eipconfig.DesiredTraefik{
		HTTPPort:      8080,
		HTTPSPort:     8443,
		DashboardPort: 8081,
		DashboardPath: "/tf",
		DashboardRule: eipconfig.TraefikDashboardRule("/tf"),
	}
	live := eipconfig.LiveTraefik{
		PublishedByTarget: map[uint32]uint32{80: 80, 443: 443, 81: 81},
		DashboardRule:     eipconfig.TraefikDashboardRule("/dashboard"),
	}
	ch := eipconfig.DiffTraefik(live, desire)
	if len(ch) != 4 {
		t.Fatalf("want 4 changes, got %#v", ch)
	}
	fields := map[string]bool{}
	for _, c := range ch {
		fields[c.Field] = true
	}
	for _, want := range []string{
		"publish:target=80",
		"publish:target=443",
		"publish:target=81",
		"label:traefik.http.routers.traefik-dashboard.rule",
	} {
		if !fields[want] {
			t.Fatalf("missing field %q in %#v", want, ch)
		}
	}
}

func TestDiffTraefikTrustedProxies(t *testing.T) {
	t.Parallel()
	desire := eipconfig.DesiredTraefik{
		HTTPPort:          80,
		HTTPSPort:         443,
		DashboardPort:     81,
		DashboardRule:     eipconfig.TraefikDashboardRule("/dashboard"),
		TrustedProxyCIDRs: "203.0.113.0/24",
	}
	live := eipconfig.LiveTraefik{
		PublishedByTarget: map[uint32]uint32{80: 80, 443: 443, 81: 81},
		DashboardRule:     desire.DashboardRule,
		TrustedProxyCIDRs: "",
	}
	ch := eipconfig.DiffTraefik(live, desire)
	if len(ch) != 1 || ch[0].Field != "env:TRAEFIK_ENTRYPOINTS_WEB_FORWARDEDHEADERS_TRUSTEDIPS" {
		t.Fatalf("got %#v", ch)
	}
}

func TestTraefikDashboardRule(t *testing.T) {
	t.Parallel()
	got := eipconfig.TraefikDashboardRule("/dash")
	want := "PathPrefix(`/dash`) || PathPrefix(`/api`)"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestGrafanaPathNeedsApply(t *testing.T) {
	t.Parallel()
	live := eipconfig.LiveGrafana{
		Running:       true,
		RootURL:       "http://127.0.0.1/grafana/",
		PathFromLabel: "/grafana",
	}
	if eipconfig.GrafanaPathNeedsApply(live, "/grafana") {
		t.Fatal("expected no apply")
	}
	if !eipconfig.GrafanaPathNeedsApply(live, "/ops") {
		t.Fatal("expected apply on path change")
	}
	if eipconfig.GrafanaPathNeedsApply(eipconfig.LiveGrafana{Running: false}, "/ops") {
		t.Fatal("skip when not running")
	}
}

func TestPathFromTraefikRule(t *testing.T) {
	t.Parallel()
	got := eipconfig.PathFromTraefikRule("PathPrefix(`/ops`)")
	if got != "/ops" {
		t.Fatalf("got %q", got)
	}
}
