//go:build integration

package swarm

// Real-daemon Swarm tests. CI: .github/workflows/deployment-tool.yml job "integration"
// (ubuntu + swarm init). Local: go test ./internal/swarm/ -tags=integration -count=1

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/containerd/errdefs"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
)

func TestIntegrationSecretEnsureIdempotentAndPrune(t *testing.T) {
	ctx := context.Background()
	apiClient := requireSwarmClient(t)

	key := "ITEST_MONGO_PASSWORD"
	v1 := []byte("secret-value-one")
	v2 := []byte("secret-value-two")

	obj1, err := ensureSecret(ctx, apiClient, key, string(v1))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = apiClient.SecretRemove(context.Background(), obj1, client.SecretRemoveOptions{}) })

	again, err := ensureSecret(ctx, apiClient, key, string(v1))
	if err != nil {
		t.Fatal(err)
	}
	if again != obj1 {
		t.Fatalf("idempotent ensure: got %q want %q", again, obj1)
	}
	if want := Name(key, v1); obj1 != want {
		t.Fatalf("name: got %q want %q", obj1, want)
	}

	obj2, err := ensureSecret(ctx, apiClient, key, string(v2))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = apiClient.SecretRemove(context.Background(), obj2, client.SecretRemoveOptions{}) })
	if obj2 == obj1 {
		t.Fatal("content change must mint a new hashed secret name")
	}

	PruneStale(ctx, SecretsOverlay{KeyToObj: map[string]string{key: obj2}})

	if _, err := apiClient.SecretInspect(ctx, obj1, client.SecretInspectOptions{}); !errdefs.IsNotFound(err) {
		t.Fatalf("pruned secret %s: want NotFound, got %v", obj1, err)
	}
	if _, err := apiClient.SecretInspect(ctx, obj2, client.SecretInspectOptions{}); err != nil {
		t.Fatalf("kept secret %s missing: %v", obj2, err)
	}
}

func TestIntegrationConfigEnsureIdempotentAndPrune(t *testing.T) {
	ctx := context.Background()
	apiClient := requireSwarmClient(t)

	key := "itest_loki_yml"
	v1 := []byte("auth_enabled: false\n")
	v2 := []byte("auth_enabled: true\n")

	obj1, err := ensureConfig(ctx, apiClient, key, v1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = apiClient.ConfigRemove(context.Background(), obj1, client.ConfigRemoveOptions{}) })

	again, err := ensureConfig(ctx, apiClient, key, v1)
	if err != nil {
		t.Fatal(err)
	}
	if again != obj1 {
		t.Fatalf("idempotent ensure: got %q want %q", again, obj1)
	}

	obj2, err := ensureConfig(ctx, apiClient, key, v2)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = apiClient.ConfigRemove(context.Background(), obj2, client.ConfigRemoveOptions{}) })
	if obj2 == obj1 {
		t.Fatal("content change must mint a new hashed config name")
	}

	pruneOldConfigs(ctx, apiClient, key, obj2)

	if _, err := apiClient.ConfigInspect(ctx, obj1, client.ConfigInspectOptions{}); !errdefs.IsNotFound(err) {
		t.Fatalf("pruned config %s: want NotFound, got %v", obj1, err)
	}
	if _, err := apiClient.ConfigInspect(ctx, obj2, client.ConfigInspectOptions{}); err != nil {
		t.Fatalf("kept config %s missing: %v", obj2, err)
	}
}

func TestIntegrationSecretInspectMissing(t *testing.T) {
	ctx := context.Background()
	apiClient := requireSwarmClient(t)
	_, err := apiClient.SecretInspect(ctx, "eip_ITEST_missing_000000000000", client.SecretInspectOptions{})
	if !errdefs.IsNotFound(err) {
		t.Fatalf("want IsNotFound, got %v", err)
	}
}

func requireSwarmClient(t *testing.T) *client.Client {
	t.Helper()
	apiClient, err := docker.NewAPIClient(client.WithTimeout(2 * time.Minute))
	if err != nil {
		t.Fatalf("engine API client: %v (Docker required for -tags=integration)", err)
	}
	t.Cleanup(func() { _ = apiClient.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	info, err := apiClient.Info(ctx, client.InfoOptions{})
	if err != nil {
		t.Fatalf("docker info: %v", err)
	}
	state := strings.ToLower(string(info.Info.Swarm.LocalNodeState))
	if state == "active" {
		return apiClient
	}
	_, err = apiClient.SwarmInit(ctx, client.SwarmInitOptions{
		ListenAddr:    "0.0.0.0:2377",
		AdvertiseAddr: "",
	})
	if err != nil {
		// Already-in-swarm races or restricted CI — surface clearly.
		t.Fatalf("swarm init (state=%s): %v", state, err)
	}
	return apiClient
}
