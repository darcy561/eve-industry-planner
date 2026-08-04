package config

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/moby/moby/api/types/network"
	swarmtypes "github.com/moby/moby/api/types/swarm"

	"eve-industry-planner/deployment-tool/internal/docker/enginetest"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// Flow tests drive inspect → diff → ApplyServiceSpecPatch through the real apply
// entrypoints (enginetest), asserting the ServiceUpdate payload end-to-end.

func TestFlowCapacityApply(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	var replicas uint64 = 1
	eng.SetServiceOK("eip_worker", swarmtypes.Service{
		ID:   "worker-id",
		Meta: swarmtypes.Meta{Version: swarmtypes.Version{Index: 3}},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_worker",
				Labels: map[string]string{
					stack.LabelCapacityService: "worker",
					stack.LabelCapacityMin:     "1",
					stack.LabelCapacityMax:     "2",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "worker:latest",
					Env:   []string{stack.EnvWorkerAsynqConcurrency + "=10"},
				},
			},
			Mode: swarmtypes.ServiceMode{
				Replicated: &swarmtypes.ReplicatedService{Replicas: &replicas},
			},
		},
	})

	cfg := Config{
		Services: map[string]ServiceSpec{
			"worker": {Min: 2, Max: 4, Concurrency: 12},
		},
	}
	targets := []stack.CapacityTarget{{
		Service:      "worker",
		YAMLKey:      "worker",
		SwarmService: "eip_worker",
	}}
	doc := stack.Doc{Services: map[string]stack.Service{
		"worker": {Environment: stack.ServiceEnv{stack.EnvWorkerAsynqConcurrency: "10"}},
	}}

	if err := applyCapacity(context.Background(), eng.APIClient(), cfg, targets, doc, false); err != nil {
		t.Fatal(err)
	}
	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want ServiceUpdate")
	}
	if call.ID != "worker-id" {
		t.Fatalf("id=%q", call.ID)
	}
	if call.Spec.Labels[stack.LabelCapacityService] != "worker" ||
		call.Spec.Labels[stack.LabelCapacityMin] != "2" ||
		call.Spec.Labels[stack.LabelCapacityMax] != "4" {
		t.Fatalf("labels=%v", call.Spec.Labels)
	}
	env := parseEnvList(call.Spec.TaskTemplate.ContainerSpec.Env)
	if env[stack.EnvWorkerAsynqConcurrency] != "12" {
		t.Fatalf("env=%v", env)
	}
	if call.Spec.Mode.Replicated == nil || call.Spec.Mode.Replicated.Replicas == nil || *call.Spec.Mode.Replicated.Replicas != 2 {
		t.Fatalf("replicas=%+v", call.Spec.Mode)
	}
}

func TestFlowCapacityUnchanged(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	var replicas uint64 = 2
	eng.SetServiceOK("eip_worker", swarmtypes.Service{
		ID:   "worker-id",
		Meta: swarmtypes.Meta{Version: swarmtypes.Version{Index: 1}},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_worker",
				Labels: map[string]string{
					stack.LabelCapacityService: "worker",
					stack.LabelCapacityMin:     "2",
					stack.LabelCapacityMax:     "4",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "worker:latest",
					Env:   []string{stack.EnvWorkerAsynqConcurrency + "=12"},
				},
			},
			Mode: swarmtypes.ServiceMode{
				Replicated: &swarmtypes.ReplicatedService{Replicas: &replicas},
			},
		},
	})
	cfg := Config{Services: map[string]ServiceSpec{
		"worker": {Min: 2, Max: 4, Concurrency: 12},
	}}
	targets := []stack.CapacityTarget{{
		Service: "worker", YAMLKey: "worker", SwarmService: "eip_worker",
	}}
	doc := stack.Doc{Services: map[string]stack.Service{
		"worker": {Environment: stack.ServiceEnv{stack.EnvWorkerAsynqConcurrency: "12"}},
	}}
	if err := applyCapacity(context.Background(), eng.APIClient(), cfg, targets, doc, false); err != nil {
		t.Fatal(err)
	}
	if _, ok := eng.LastServiceUpdate(); ok {
		t.Fatal("unchanged must not ServiceUpdate")
	}
}

func TestFlowTraefikApply(t *testing.T) {
	t.Parallel()
	stackPath := writeTraefikStack(t)
	eng := enginetest.New(t)
	ruleKey := "traefik.http.routers.traefik-dashboard.rule"
	eng.SetServiceOK("eip_traefik", swarmtypes.Service{
		ID:   "traefik-id",
		Meta: swarmtypes.Meta{Version: swarmtypes.Version{Index: 5}},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_traefik",
				Labels: map[string]string{
					ruleKey: "PathPrefix(`/dashboard`) || PathPrefix(`/api`)",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "traefik:latest",
					Env:   []string{traefikEnvTrustedIPsWeb + "=10.0.0.1"},
				},
			},
			EndpointSpec: &swarmtypes.EndpointSpec{
				Ports: []swarmtypes.PortConfig{
					{TargetPort: 80, PublishedPort: 80, Protocol: network.TCP, PublishMode: swarmtypes.PortConfigPublishModeIngress},
					{TargetPort: 443, PublishedPort: 443, Protocol: network.TCP, PublishMode: swarmtypes.PortConfigPublishModeIngress},
					{TargetPort: 81, PublishedPort: 81, Protocol: network.TCP, PublishMode: swarmtypes.PortConfigPublishModeIngress},
				},
			},
		},
	})

	cfg := Config{
		Ports: Ports{HTTP: 8080, HTTPS: 8443, TraefikDashboard: 9081},
		Paths: Paths{TraefikDashboard: "/ops"},
		Proxy: Proxy{TrustedCIDRs: []string{"10.0.0.0/8"}},
	}
	if err := applyTraefikConfig(context.Background(), eng.APIClient(), cfg, stackPath, "eip", false); err != nil {
		t.Fatal(err)
	}
	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want ServiceUpdate")
	}
	if call.Spec.Labels[ruleKey] != "PathPrefix(`/ops`) || PathPrefix(`/api`)" {
		t.Fatalf("rule=%q", call.Spec.Labels[ruleKey])
	}
	env := parseEnvList(call.Spec.TaskTemplate.ContainerSpec.Env)
	if env[traefikEnvTrustedIPsWeb] != "10.0.0.0/8" || env[traefikEnvTrustedIPsWebsecure] != "10.0.0.0/8" {
		t.Fatalf("env=%v", env)
	}
	pub := map[uint32]uint32{}
	for _, p := range call.Spec.EndpointSpec.Ports {
		pub[p.TargetPort] = p.PublishedPort
	}
	if pub[80] != 8080 || pub[443] != 8443 || pub[81] != 9081 {
		t.Fatalf("ports=%v", pub)
	}
}

func TestFlowGrafanaApply(t *testing.T) {
	t.Parallel()
	home := writeGrafanaObsHome(t)
	eng := enginetest.New(t)
	ruleKey := "traefik.http.routers.grafana.rule"
	eng.SetServiceOK("eip_grafana", swarmtypes.Service{
		ID:   "grafana-id",
		Meta: swarmtypes.Meta{Version: swarmtypes.Version{Index: 2}},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_grafana",
				Labels: map[string]string{
					"traefik.enable":        "false",
					"traefik.swarm.network": "eip-public",
					ruleKey:                 "PathPrefix(`/grafana`)",
					"keep.other":            "1",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "grafana:latest",
					Env:   []string{"GF_SERVER_ROOT_URL=http://127.0.0.1/grafana/"},
				},
			},
		},
	})

	cfg := Config{
		Paths: Paths{Grafana: "/ops"},
		Addons: Addons{Observability: ObservabilityAddon{
			Enabled: true,
			Grafana: ObservabilityGrafana{
				Public:  true,
				BaseURL: "https://ops.example.com",
			},
		}},
	}
	if err := applyGrafanaPath(context.Background(), eng.APIClient(), cfg, home, "eip", false); err != nil {
		t.Fatal(err)
	}
	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want ServiceUpdate")
	}
	if call.Spec.Labels["traefik.enable"] != "true" {
		t.Fatalf("enable=%q", call.Spec.Labels["traefik.enable"])
	}
	if call.Spec.Labels[ruleKey] != "PathPrefix(`/ops`)" {
		t.Fatalf("rule=%q", call.Spec.Labels[ruleKey])
	}
	if call.Spec.Labels["keep.other"] != "1" {
		t.Fatal("non-traefik labels must remain")
	}
	env := parseEnvList(call.Spec.TaskTemplate.ContainerSpec.Env)
	if env["GF_SERVER_ROOT_URL"] != "https://ops.example.com/ops/" {
		t.Fatalf("root=%q", env["GF_SERVER_ROOT_URL"])
	}
}

func TestFlowGrafanaApplyDefaultRootURL(t *testing.T) {
	t.Parallel()
	home := writeGrafanaObsHome(t)
	eng := enginetest.New(t)
	ruleKey := "traefik.http.routers.grafana.rule"
	eng.SetServiceOK("eip_grafana", swarmtypes.Service{
		ID:   "grafana-id",
		Meta: swarmtypes.Meta{Version: swarmtypes.Version{Index: 2}},
		Spec: swarmtypes.ServiceSpec{
			Annotations: swarmtypes.Annotations{
				Name: "eip_grafana",
				Labels: map[string]string{
					"traefik.enable": "false",
					ruleKey:          "PathPrefix(`/grafana`)",
				},
			},
			TaskTemplate: swarmtypes.TaskSpec{
				ContainerSpec: &swarmtypes.ContainerSpec{
					Image: "grafana:latest",
					Env:   []string{"GF_SERVER_ROOT_URL=http://127.0.0.1/grafana/"},
				},
			},
		},
	})

	cfg := Config{
		Paths: Paths{Grafana: "/ops"},
		Addons: Addons{Observability: ObservabilityAddon{
			Enabled: true,
			Grafana: ObservabilityGrafana{Public: false}, // base_url omitted → local derive
		}},
	}
	if err := applyGrafanaPath(context.Background(), eng.APIClient(), cfg, home, "eip", false); err != nil {
		t.Fatal(err)
	}
	call, ok := eng.LastServiceUpdate()
	if !ok {
		t.Fatal("want ServiceUpdate")
	}
	if call.Spec.Labels[ruleKey] != "PathPrefix(`/ops`)" {
		t.Fatalf("rule=%q", call.Spec.Labels[ruleKey])
	}
	if call.Spec.Labels["traefik.enable"] != "false" {
		t.Fatalf("enable=%q", call.Spec.Labels["traefik.enable"])
	}
	env := parseEnvList(call.Spec.TaskTemplate.ContainerSpec.Env)
	if env["GF_SERVER_ROOT_URL"] != "http://127.0.0.1/ops/" {
		t.Fatalf("root=%q", env["GF_SERVER_ROOT_URL"])
	}
}

func writeGrafanaObsHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	bt := "`"
	body := `
services:
  grafana:
    environment:
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL:-http://127.0.0.1/grafana/}
    deploy:
      labels:
        - "traefik.enable=false"
        - "traefik.swarm.network=eip-public"
        - "traefik.http.routers.grafana.rule=PathPrefix(` + bt + `${EIP_GRAFANA_PATH:-/grafana}` + bt + `)"
`
	if err := os.WriteFile(filepath.Join(dir, kit.ObsStackFile), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}
