// Package engine prepares Docker Swarm and external resources declared in stack YAML.
// External volumes/networks come from docker-stack*.yml (SoT).
package engine

import (
	"context"
	"fmt"
	"strings"

	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/swarm"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"

	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/stack"
)

// Ready ensures Swarm is active, then creates missing external networks/volumes
// named in stackFiles (relative to home; default app + data).
func Ready(ctx context.Context, cli *client.Client, home string, stackFiles ...string) error {
	if err := ensureSwarm(ctx, cli); err != nil {
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
		if err := ensureOverlay(ctx, cli, name); err != nil {
			return err
		}
	}
	return ensureVolumes(ctx, cli, stack.ExternalVolumes(docs...))
}

func ensureSwarm(ctx context.Context, cli *client.Client) error {
	info, err := cli.Info(ctx)
	if err != nil {
		return fmt.Errorf("docker info: %w", err)
	}
	state := strings.ToLower(string(info.Swarm.LocalNodeState))
	if state == "active" {
		return nil
	}
	_, err = cli.SwarmInit(ctx, swarm.InitRequest{
		ListenAddr:    "0.0.0.0:2377",
		AdvertiseAddr: "",
	})
	if err != nil {
		return fmt.Errorf("swarm init: %w", err)
	}
	return nil
}

func ensureOverlay(ctx context.Context, cli *client.Client, name string) error {
	nw, err := cli.NetworkInspect(ctx, name, network.InspectOptions{})
	if err == nil {
		if nw.Driver != "overlay" {
			return fmt.Errorf("network %q is driver=%s; need attachable overlay", name, nw.Driver)
		}
		if !nw.Attachable {
			return fmt.Errorf("network %q is overlay but not attachable; recreate manually", name)
		}
		return nil
	}
	if !client.IsErrNotFound(err) {
		return fmt.Errorf("inspect network %q: %w", name, err)
	}
	_, err = cli.NetworkCreate(ctx, name, network.CreateOptions{
		Driver:     "overlay",
		Attachable: true,
	})
	if err != nil {
		return fmt.Errorf("create network %q: %w", name, err)
	}
	return nil
}

func ensureVolumes(ctx context.Context, cli *client.Client, names []string) error {
	for _, name := range names {
		_, err := cli.VolumeInspect(ctx, name)
		if err == nil {
			continue
		}
		if !client.IsErrNotFound(err) {
			return fmt.Errorf("inspect volume %q: %w", name, err)
		}
		if _, err := cli.VolumeCreate(ctx, volume.CreateOptions{Name: name}); err != nil {
			return fmt.Errorf("create volume %q: %w", name, err)
		}
	}
	return nil
}
