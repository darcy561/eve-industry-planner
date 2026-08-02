package images

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRegistryHost(t *testing.T) {
	cases := []struct {
		ref, want string
	}{
		{"redis:8", "docker.io"},
		{"library/redis:8", "docker.io"},
		{"ghcr.io/darcy561/eve-industry-planner-api:prerelease-x", "ghcr.io"},
		{"docker.io/library/mongo:8", "docker.io"},
		{"registry.example.com:5000/app:1", "registry.example.com:5000"},
	}
	for _, tc := range cases {
		if got := registryHost(tc.ref); got != tc.want {
			t.Fatalf("%q: got %q want %q", tc.ref, got, tc.want)
		}
	}
}

func TestRegistryAuthBase64FromConfigAuths(t *testing.T) {
	dir := t.TempDir()
	auth := base64.StdEncoding.EncodeToString([]byte("user:secret-token"))
	cfg := map[string]any{
		"auths": map[string]any{
			"ghcr.io": map[string]string{"auth": auth},
		},
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DOCKER_CONFIG", dir)

	got := registryAuthBase64("ghcr.io/darcy561/eve-industry-planner-api:tag")
	if got == "" {
		t.Fatal("expected encoded auth")
	}
	decoded, err := base64.URLEncoding.DecodeString(got)
	if err != nil {
		decoded, err = base64.StdEncoding.DecodeString(got)
		if err != nil {
			t.Fatalf("decode auth header: %v (%q)", err, got)
		}
	}
	var ac map[string]string
	if err := json.Unmarshal(decoded, &ac); err != nil {
		t.Fatal(err)
	}
	if ac["username"] == "" && ac["auth"] == "" {
		t.Fatalf("unexpected auth payload: %s", decoded)
	}
}

func TestRegistryAuthBase64AnonymousWhenMissing(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"auths":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DOCKER_CONFIG", dir)

	if got := registryAuthBase64("ghcr.io/someone/private:1"); got != "" {
		t.Fatalf("expected empty anonymous auth, got %q", got)
	}
	if got := registryAuthBase64("redis:8"); got != "" {
		t.Fatalf("expected empty for redis, got %q", got)
	}
}
