package images

import (
	"os"
	"path/filepath"
	"testing"

	"eve-industry-planner/deployment-tool/internal/kit"
)

func TestLiveImageRefsAppAndData(t *testing.T) {
	home := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(home, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(kit.EnvFile, "APP_VERSION=0.8\n")
	write(kit.AppStackFile, `
services:
  api:
    image: ghcr.io/example/api:${APP_VERSION}
  wiki:
    image: ghcr.io/example/wiki:${WIKI_COMPAT_TAG}
  proxy:
    image: traefik:v3
`)
	write(kit.DataStackFile, `
services:
  mongo:
    image: mongo:8
`)
	refs, err := LiveImageRefs(home, false)
	if err != nil {
		t.Fatal(err)
	}
	bySvc := map[string]string{}
	for _, r := range refs {
		bySvc[r.Service] = r.Image
	}
	if bySvc["api"] != "ghcr.io/example/api:0.8" {
		t.Fatalf("api=%q", bySvc["api"])
	}
	if bySvc["wiki"] != "ghcr.io/example/wiki:0.8" {
		t.Fatalf("wiki=%q", bySvc["wiki"])
	}
	if bySvc["proxy"] != "traefik:v3" {
		t.Fatalf("proxy=%q", bySvc["proxy"])
	}
	if bySvc["mongo"] != "mongo:8" {
		t.Fatalf("mongo=%q", bySvc["mongo"])
	}
	imgs := UniqueImages(refs)
	if len(imgs) != 4 {
		t.Fatalf("unique=%v", imgs)
	}
}

func TestLiveImageRefsWikiCompatTag(t *testing.T) {
	home := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(home, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(kit.EnvFile, "APP_VERSION=1.2.3\n")
	write(kit.AppStackFile, `
services:
  wiki:
    image: ghcr.io/example/wiki:${WIKI_COMPAT_TAG}
`)
	write(kit.DataStackFile, "services: {}\n")
	refs, err := LiveImageRefs(home, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 || refs[0].Service != "wiki" || refs[0].Image != "ghcr.io/example/wiki:1.2" {
		t.Fatalf("%+v", refs)
	}
}

func TestLiveImageRefsObsGated(t *testing.T) {
	home := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(home, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(kit.EnvFile, "APP_VERSION=1\n")
	write(kit.AppStackFile, "services:\n  api:\n    image: ghcr.io/x/api:${APP_VERSION}\n")
	write(kit.DataStackFile, "services:\n  redis:\n    image: redis:8\n")
	write(kit.ObsStackFile, "services:\n  grafana:\n    image: grafana/grafana:11\n")

	refs, err := LiveImageRefs(home, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range refs {
		if r.Service == "grafana" {
			t.Fatal("obs service present when wantObs=false")
		}
	}
	refs, err = LiveImageRefs(home, true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, r := range refs {
		if r.Service == "grafana" && r.Image == "grafana/grafana:11" {
			found = true
		}
	}
	if !found {
		t.Fatalf("grafana missing: %+v", refs)
	}
}
