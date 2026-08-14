package docker

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, dir, currentContext string) {
	t.Helper()
	body := "{}"
	if currentContext != "" {
		body = fmt.Sprintf(`{"currentContext":%q}`, currentContext)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeContextMeta(t *testing.T, dir, name, host string) {
	t.Helper()
	sum := sha256.Sum256([]byte(name))
	metaDir := filepath.Join(dir, "contexts", "meta", fmt.Sprintf("%x", sum))
	if err := os.MkdirAll(metaDir, 0o755); err != nil {
		t.Fatal(err)
	}
	meta := fmt.Sprintf(`{"Name":%q,"Endpoints":{"docker":{"Host":%q}}}`, name, host)
	if err := os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte(meta), 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeContext(t *testing.T, dir, name, host string) {
	t.Helper()
	writeConfig(t, dir, name)
	writeContextMeta(t, dir, name, host)
}

func clearDockerEnv(t *testing.T, configDir string) {
	t.Helper()
	t.Setenv("DOCKER_CONFIG", configDir)
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")
}

func TestResolveDockerEndpointFromContext(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)

	const (
		name = "desktop-linux"
		host = "npipe:////./pipe/dockerDesktopLinuxEngine"
	)
	writeContext(t, dir, name, host)

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != host {
		t.Fatalf("ResolveDockerEndpoint=%q want %q", got, host)
	}
}

func TestResolveDockerEndpointUnixSocketContext(t *testing.T) {
	// macOS / Linux Desktop-style context Host (not the SDK default path).
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	const (
		name = "desktop-linux"
		host = "unix:///Users/test/.docker/run/docker.sock"
	)
	writeContext(t, dir, name, host)

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != host {
		t.Fatalf("got %q want %q", got, host)
	}
}

func TestResolveDockerEndpointPrefersDOCKER_HOST(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	t.Setenv("DOCKER_HOST", "npipe:////./pipe/custom")
	writeContext(t, dir, "desktop-linux", "npipe:////./pipe/dockerDesktopLinuxEngine")

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "npipe:////./pipe/custom" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveDockerEndpointDOCKER_CONTEXTOverride(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	// config points at unused; DOCKER_CONTEXT selects the real one.
	writeConfig(t, dir, "other")
	writeContextMeta(t, dir, "other", "unix:///tmp/other.sock")
	writeContextMeta(t, dir, "desktop-linux", "npipe:////./pipe/dockerDesktopLinuxEngine")
	t.Setenv("DOCKER_CONTEXT", "desktop-linux")

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "npipe:////./pipe/dockerDesktopLinuxEngine" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveDockerEndpointDefaultContextEmpty(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	writeConfig(t, dir, "")

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty for default, got %q", got)
	}
}

func TestResolveDockerEndpointNamedDefaultEmpty(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	writeConfig(t, dir, "default")
	// Even if meta existed, "default" means SDK platform default.
	writeContextMeta(t, dir, "default", "unix:///should-not-use.sock")

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty for named default, got %q", got)
	}
}

func TestResolveDockerEndpointMissingMetaEmpty(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	writeConfig(t, dir, "desktop-linux")

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty when meta missing, got %q", got)
	}
}

func TestResolveDockerEndpointMissingConfigEmpty(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	// No config.json at all.

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty, got %q", got)
	}
}

func TestResolveDockerEndpointInvalidConfigJSON(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{not-json`), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := ResolveDockerEndpoint()
	if err == nil {
		t.Fatal("expected error for invalid config.json")
	}
	if !strings.Contains(err.Error(), "config.json") {
		t.Fatalf("error should mention config.json, got %v", err)
	}
}

func TestResolveDockerEndpointInvalidMetaJSON(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	writeConfig(t, dir, "desktop-linux")
	sum := sha256.Sum256([]byte("desktop-linux"))
	metaDir := filepath.Join(dir, "contexts", "meta", fmt.Sprintf("%x", sum))
	if err := os.MkdirAll(metaDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte(`{bad`), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := ResolveDockerEndpoint()
	if err == nil {
		t.Fatal("expected error for invalid meta.json")
	}
	if !strings.Contains(err.Error(), "meta") {
		t.Fatalf("error should mention meta, got %v", err)
	}
}

func TestResolveDockerEndpointEmptyDockerEndpoint(t *testing.T) {
	dir := t.TempDir()
	clearDockerEnv(t, dir)
	writeConfig(t, dir, "desktop-linux")
	sum := sha256.Sum256([]byte("desktop-linux"))
	metaDir := filepath.Join(dir, "contexts", "meta", fmt.Sprintf("%x", sum))
	if err := os.MkdirAll(metaDir, 0o755); err != nil {
		t.Fatal(err)
	}
	meta := `{"Name":"desktop-linux","Endpoints":{}}`
	if err := os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte(meta), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := ResolveDockerEndpoint()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty when docker endpoint missing, got %q", got)
	}
}
