package docker

import (
	"context"
	"fmt"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
)

// StackNamespaceFilter returns a label filter for com.docker.stack.namespace=<stack>.
func StackNamespaceFilter(stackName string) filters.Args {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	return filters.NewArgs(filters.Arg("label", LabelStackNamespace+"="+stackName))
}

// RemoveStackServices removes every Swarm service labeled with the stack namespace.
// Does not remove volumes. External networks (e.g. eip-core) are left alone.
func RemoveStackServices(ctx context.Context, cli client.APIClient, stackName string) (int, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	svcs, err := cli.ServiceList(ctx, types.ServiceListOptions{Filters: StackNamespaceFilter(stackName)})
	if err != nil {
		return 0, fmt.Errorf("list stack services: %w", err)
	}
	for _, svc := range svcs {
		name := svc.Spec.Name
		if name == "" {
			name = svc.ID
		}
		if err := cli.ServiceRemove(ctx, svc.ID); err != nil {
			return 0, fmt.Errorf("remove service %s: %w", name, err)
		}
	}
	return len(svcs), nil
}

// RemoveStackNetworks removes networks labeled with the stack namespace (best-effort).
func RemoveStackNetworks(ctx context.Context, cli client.APIClient, stackName string) (int, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	nets, err := cli.NetworkList(ctx, types.NetworkListOptions{Filters: StackNamespaceFilter(stackName)})
	if err != nil {
		return 0, fmt.Errorf("list stack networks: %w", err)
	}
	n := 0
	for _, nw := range nets {
		if err := cli.NetworkRemove(ctx, nw.ID); err != nil {
			continue
		}
		n++
	}
	return n, nil
}

// WaitStackGone waits until no services remain with the stack namespace label.
func WaitStackGone(ctx context.Context, cli client.APIClient, stackName string, timeout time.Duration) error {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	for {
		svcs, err := cli.ServiceList(ctx, types.ServiceListOptions{Filters: StackNamespaceFilter(stackName)})
		if err != nil {
			return fmt.Errorf("wait stack gone: %w", err)
		}
		if len(svcs) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("stack %s still has %d service(s) after %s", stackName, len(svcs), timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}

// RemoveComposeProject removes containers and networks for a Compose project label
// (compose down without -v). Volumes are kept. Safe scope: label filter only.
func RemoveComposeProject(ctx context.Context, cli client.APIClient, project string) (containers, networks int, err error) {
	if project == "" {
		return 0, 0, fmt.Errorf("compose project: empty name")
	}
	f := filters.NewArgs(filters.Arg("label", LabelComposeProject+"="+project))

	list, err := cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return 0, 0, fmt.Errorf("list compose containers: %w", err)
	}
	for _, c := range list {
		if err := cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true, RemoveVolumes: false}); err != nil {
			return containers, networks, fmt.Errorf("remove container %s: %w", shortID(c.ID), err)
		}
		containers++
	}

	nets, err := cli.NetworkList(ctx, types.NetworkListOptions{Filters: f})
	if err != nil {
		return containers, 0, fmt.Errorf("list compose networks: %w", err)
	}
	for _, nw := range nets {
		if err := cli.NetworkRemove(ctx, nw.ID); err != nil {
			continue
		}
		networks++
	}
	return containers, networks, nil
}
