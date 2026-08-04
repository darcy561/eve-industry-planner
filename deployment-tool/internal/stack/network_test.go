package stack

import (
	"path/filepath"
	"testing"
)

func TestResolveNetworkRef(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "obs.yml")
	mustWrite(t, path, `
services:
  grafana:
    image: grafana/grafana:x
    deploy:
      labels:
        eip.network.detach: eip-core
        traefik.swarm.network: eip-public
networks:
  eip-core:
    name: eip-core
    external: true
  eip-public:
    name: eip-public
  eip-obs:
    name: eip-obs
`)
	doc, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ResolveNetworkRef("eip-obs", doc)
	if err != nil || got != "eip-obs" {
		t.Fatalf("obs=%q err=%v", got, err)
	}
	got, err = ResolveNetworkRef("eip-public", doc)
	if err != nil || got != "eip-public" {
		t.Fatalf("edge=%q err=%v", got, err)
	}
	detach, ok := ServiceDeployLabel(doc, "grafana", LabelNetworkDetach)
	if !ok || detach != "eip-core" {
		t.Fatalf("detach=%q ok=%v", detach, ok)
	}
	if !HasService(doc, "grafana") {
		t.Fatal("expected grafana service")
	}
}

func TestResolveNetworkRefAcrossDocs(t *testing.T) {
	t.Parallel()
	data := Doc{Networks: map[string]Network{"eip-core": {Name: "eip-core", External: true}}}
	obs := Doc{Networks: map[string]Network{"eip-obs": {Name: "eip-obs"}}}
	got, err := ResolveNetworkRef("eip-obs", data, obs)
	if err != nil || got != "eip-obs" {
		t.Fatalf("got %q err=%v", got, err)
	}
	if _, err := ResolveNetworkRef("eip-obs", data); err == nil {
		t.Fatal("want missing network error")
	}
}
