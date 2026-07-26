package docker

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// ResolveDockerEndpoint returns the Engine API host the Docker CLI would use.
//
// The Engine SDK's FromEnv does not read Docker CLI contexts. On Docker Desktop
// the active context is often desktop-linux → dockerDesktopLinuxEngine (or a
// Desktop unix socket), not the legacy SDK default pipe/socket. This helper is
// CLI-context compatibility only — not OS service / WSL / Hyper-V detection.
//
// Precedence: DOCKER_HOST → DOCKER_CONTEXT → config currentContext Host → ""
// (empty = let the SDK use its platform default). Does not load context TLS
// (remote contexts out of scope while local-only).
func ResolveDockerEndpoint() (string, error) {
	if h := os.Getenv("DOCKER_HOST"); h != "" {
		return h, nil
	}
	return contextHost()
}

// contextHost reads Endpoints.docker.Host from the active CLI context store.
// Returns "" for default / missing context (caller uses client.FromEnv).
func contextHost() (string, error) {
	name, err := currentContextName()
	if err != nil {
		return "", err
	}
	if name == "" || name == "default" {
		return "", nil
	}
	return contextEndpointHost(name)
}

func dockerConfigDir() string {
	if d := os.Getenv("DOCKER_CONFIG"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".docker")
}

func currentContextName() (string, error) {
	if name := os.Getenv("DOCKER_CONTEXT"); name != "" {
		return name, nil
	}
	dir := dockerConfigDir()
	if dir == "" {
		return "", nil
	}
	b, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	var cfg struct {
		CurrentContext string `json:"currentContext"`
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return "", fmt.Errorf("docker config.json: %w", err)
	}
	return cfg.CurrentContext, nil
}

func contextEndpointHost(name string) (string, error) {
	dir := dockerConfigDir()
	if dir == "" {
		return "", nil
	}
	sum := sha256.Sum256([]byte(name))
	metaPath := filepath.Join(dir, "contexts", "meta", fmt.Sprintf("%x", sum), "meta.json")
	b, err := os.ReadFile(metaPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf("docker context %q: %w", name, err)
	}
	var meta struct {
		Endpoints map[string]struct {
			Host string `json:"Host"`
		} `json:"Endpoints"`
	}
	if err := json.Unmarshal(b, &meta); err != nil {
		return "", fmt.Errorf("docker context %q meta: %w", name, err)
	}
	ep, ok := meta.Endpoints["docker"]
	if !ok || ep.Host == "" {
		return "", nil
	}
	return ep.Host, nil
}
