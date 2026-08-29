package images

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// TagsFromStack returns APP_VERSION + TAG_* from running Swarm service images
// (dev bake tags). Used by rematerialise expand; does not bake.
func TagsFromStack(ctx context.Context, home string) (map[string]string, error) {
	envMap, err := kit.Map(filepath.Join(home, kit.EnvFile))
	if err != nil {
		return nil, err
	}
	appVersion := kit.Get(envMap, "APP_VERSION")
	if appVersion == "" {
		appVersion = "0.0.0"
	}

	devPath := filepath.Join(home, kit.AppStackDevFile)
	devDoc, err := stack.Load(devPath)
	if err != nil {
		return nil, err
	}
	devRoles := stack.ImageRepos(devDoc)
	if len(devRoles) == 0 {
		return nil, fmt.Errorf("tags: no roles in %s", kit.AppStackDevFile)
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(30 * time.Second))
	if err != nil {
		return nil, fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	snap, err := docker.LoadStackSnapshot(ctx, apiClient, docker.ResolveStackName())
	if err != nil {
		return nil, fmt.Errorf("tags: stack snapshot: %w", err)
	}

	out := map[string]string{"APP_VERSION": appVersion}
	for role, repo := range devRoles {
		tag := swarmLocalTag(repo, snap.Services[role].Image)
		if tag == "" {
			return nil, fmt.Errorf("tags: no local bake tag on service %s (image=%q); use eip secrets --live if this is a live stack", role, snap.Services[role].Image)
		}
		out["TAG_"+roleEnvKey(role)] = tag
	}
	return out, nil
}
