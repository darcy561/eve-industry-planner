package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"eve-industry-planner/admintool/internal/docker/enginetest"
	"eve-industry-planner/admintool/internal/stack"
)

func TestApplyTraefikConfigInspectErrorNotSkipped(t *testing.T) {
	t.Parallel()
	stackPath := writeTraefikStack(t)
	eng := enginetest.New(t)
	eng.SetServiceError("eip_traefik", 500, "daemon down")

	err := applyTraefikConfig(context.Background(), eng.APIClient(), Config{}, stackPath, "eip", true)
	if err == nil {
		t.Fatal("want error when Engine returns 500, got nil (must not treat as not deployed)")
	}
	if !strings.Contains(err.Error(), "inspect service") {
		t.Fatalf("got %v", err)
	}
}

func TestApplyTraefikConfigMissingSkipped(t *testing.T) {
	t.Parallel()
	stackPath := writeTraefikStack(t)
	eng := enginetest.New(t)
	eng.SetServiceMissing("eip_traefik")

	if err := applyTraefikConfig(context.Background(), eng.APIClient(), Config{}, stackPath, "eip", true); err != nil {
		t.Fatalf("missing service should skip, got %v", err)
	}
}

func TestApplyCapacityInspectErrorNotSkipped(t *testing.T) {
	t.Parallel()
	eng := enginetest.New(t)
	eng.SetServiceError("eip_worker", 500, "daemon down")
	targets := []stack.CapacityTarget{{
		Service:      "worker",
		YAMLKey:      "worker",
		SwarmService: "eip_worker",
	}}
	cfg := Config{Services: map[string]ServiceSpec{
		"worker": {Min: 1, Max: 2, Concurrency: 10},
	}}
	doc := stack.Doc{Services: map[string]stack.Service{
		"worker": {Environment: stack.ServiceEnv{stack.EnvWorkerAsynqConcurrency: "10"}},
	}}

	err := applyCapacity(context.Background(), eng.APIClient(), cfg, targets, doc, true)
	if err == nil {
		t.Fatal("want error when Engine returns 500, got nil")
	}
}

func writeTraefikStack(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "docker-stack.yml")
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
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}
