// Package engine prepares Docker Swarm and external resources declared in stack YAML
// via the Moby Engine API (SwarmInit, NetworkCreate, VolumeCreate).
// External volumes/networks come from docker-stack*.yml (SoT).
package engine

import (
	"context"
	"fmt"
	"strings"

	"github.com/containerd/errdefs"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/kit"
	"eve-industry-planner/deployment-tool/internal/stack"
)

// Ready ensures Swarm is active, then creates missing external networks/volumes
// named in stackFiles (relative to home; default app + data).
func Ready(ctx context.Context, apiClient *client.Client, home string, stackFiles ...string) error {
	if err := ensureSwarm(ctx, apiClient); err != nil {
		return err
	}
	if len(stackFiles) == 0 {
		stackFiles = []string{kit.AppStackFile, kit.DataStackFile}
	}
	docs, err := stack.LoadAll(home, stackFiles...)
	if err != nil {
		return err
	}
	for _, name := range stack.ExternalNetworks(docs...) {
		if err := ensureOverlay(ctx, apiClient, name); err != nil {
			return err
		}
	}
	return ensureVolumes(ctx, apiClient, stack.ExternalVolumes(docs...))
}

func ensureSwarm(ctx context.Context, apiClient *client.Client) error {
	info, err := apiClient.Info(ctx, client.InfoOptions{})
	if err != nil {
		return fmt.Errorf("docker info: %w", err)
	}
	state := strings.ToLower(string(info.Info.Swarm.LocalNodeState))
	if state == "active" {
		return nil
	}
	_, err = apiClient.SwarmInit(ctx, client.SwarmInitOptions{
		ListenAddr:    "0.0.0.0:2377",
		AdvertiseAddr: "",
	})
	if err != nil {
		return fmt.Errorf("swarm init: %w", err)
	}
	return nil
}

func ensureOverlay(ctx context.Context, apiClient *client.Client, name string) error {
	nw, err := apiClient.NetworkInspect(ctx, name, client.NetworkInspectOptions{})
	if err == nil {
		if nw.Network.Driver != "overlay" {
			return fmt.Errorf("network %q is driver=%s; need attachable overlay", name, nw.Network.Driver)
		}
		if !nw.Network.Attachable {
			return fmt.Errorf("network %q is overlay but not attachable; recreate manually", name)
		}
		return nil
	}
	if !errdefs.IsNotFound(err) {
		return fmt.Errorf("inspect network %q: %w", name, err)
	}
	_, err = apiClient.NetworkCreate(ctx, name, client.NetworkCreateOptions{
		Driver:     "overlay",
		Attachable: true,
	})
	if err != nil {
		if errdefs.IsConflict(err) || errdefs.IsAlreadyExists(err) {
			nw, inspErr := apiClient.NetworkInspect(ctx, name, client.NetworkInspectOptions{})
			if inspErr != nil {
				return fmt.Errorf("create network %q: %w", name, err)
			}
			if nw.Network.Driver != "overlay" {
				return fmt.Errorf("network %q is driver=%s; need attachable overlay", name, nw.Network.Driver)
			}
			if !nw.Network.Attachable {
				return fmt.Errorf("network %q is overlay but not attachable; recreate manually", name)
			}
			return nil
		}
		return fmt.Errorf("create network %q: %w", name, err)
	}
	return nil
}

func ensureVolumes(ctx context.Context, apiClient *client.Client, names []string) error {
	for _, name := range names {
		_, err := apiClient.VolumeInspect(ctx, name, client.VolumeInspectOptions{})
		if err == nil {
			continue
		}
		if !errdefs.IsNotFound(err) {
			return fmt.Errorf("inspect volume %q: %w", name, err)
		}
		if _, err := apiClient.VolumeCreate(ctx, client.VolumeCreateOptions{Name: name}); err != nil {
			if errdefs.IsConflict(err) || errdefs.IsAlreadyExists(err) {
				if _, inspErr := apiClient.VolumeInspect(ctx, name, client.VolumeInspectOptions{}); inspErr == nil {
					continue
				}
			}
			return fmt.Errorf("create volume %q: %w", name, err)
		}
	}
	return nil
}
