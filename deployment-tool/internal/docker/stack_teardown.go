package docker

import (
	"context"
	"fmt"
	"time"

	"github.com/moby/moby/client"
)

// StackNamespaceFilter returns a label filter for com.docker.stack.namespace=<stack>.
func StackNamespaceFilter(stackName string) client.Filters {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	filters := make(client.Filters)
	filters.Add("label", LabelStackNamespace+"="+stackName)
	return filters
}

// RemoveStackServices removes every Swarm service labelled with the stack namespace.
// Does not remove volumes. External networks (e.g. eip-core) are left alone.
func RemoveStackServices(ctx context.Context, apiClient *client.Client, stackName string) (int, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	svcs, err := apiClient.ServiceList(ctx, client.ServiceListOptions{Filters: StackNamespaceFilter(stackName)})
	if err != nil {
		return 0, fmt.Errorf("list stack services: %w", err)
	}
	for _, svc := range svcs.Items {
		name := svc.Spec.Name
		if name == "" {
			name = svc.ID
		}
		if _, err := apiClient.ServiceRemove(ctx, svc.ID, client.ServiceRemoveOptions{}); err != nil {
			return 0, fmt.Errorf("remove service %s: %w", name, err)
		}
	}
	return len(svcs.Items), nil
}

// RemoveStackNetworks removes networks labelled with the stack namespace (best-effort).
func RemoveStackNetworks(ctx context.Context, apiClient *client.Client, stackName string) (int, error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	nets, err := apiClient.NetworkList(ctx, client.NetworkListOptions{Filters: StackNamespaceFilter(stackName)})
	if err != nil {
		return 0, fmt.Errorf("list stack networks: %w", err)
	}
	n := 0
	for _, nw := range nets.Items {
		if _, err := apiClient.NetworkRemove(ctx, nw.ID, client.NetworkRemoveOptions{}); err != nil {
			continue
		}
		n++
	}
	return n, nil
}

// WaitStackGone waits until no services remain with the stack namespace label.
func WaitStackGone(ctx context.Context, apiClient *client.Client, stackName string, timeout time.Duration) error {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	for {
		svcs, err := apiClient.ServiceList(ctx, client.ServiceListOptions{Filters: StackNamespaceFilter(stackName)})
		if err != nil {
			return fmt.Errorf("wait stack gone: %w", err)
		}
		if len(svcs.Items) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("stack %s still has %d service(s) after %s", stackName, len(svcs.Items), timeout)
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
func RemoveComposeProject(ctx context.Context, apiClient *client.Client, project string) (containers, networks int, err error) {
	if project == "" {
		return 0, 0, fmt.Errorf("compose project: empty name")
	}
	f := make(client.Filters)
	f.Add("label", LabelComposeProject+"="+project)

	list, err := apiClient.ContainerList(ctx, client.ContainerListOptions{All: true, Filters: f})
	if err != nil {
		return 0, 0, fmt.Errorf("list compose containers: %w", err)
	}
	for _, c := range list.Items {
		if _, err := apiClient.ContainerRemove(ctx, c.ID, client.ContainerRemoveOptions{Force: true, RemoveVolumes: false}); err != nil {
			return containers, networks, fmt.Errorf("remove container %s: %w", shortID(c.ID), err)
		}
		containers++
	}

	nets, err := apiClient.NetworkList(ctx, client.NetworkListOptions{Filters: f})
	if err != nil {
		return containers, 0, fmt.Errorf("list compose networks: %w", err)
	}
	for _, nw := range nets.Items {
		if _, err := apiClient.NetworkRemove(ctx, nw.ID, client.NetworkRemoveOptions{}); err != nil {
			continue
		}
		networks++
	}
	return containers, networks, nil
}
