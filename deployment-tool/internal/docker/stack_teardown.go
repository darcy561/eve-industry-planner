package docker

import (
	"context"
	"fmt"
	"time"

	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

// networkRemoveBudget bounds the wait for endpoints to be released. Removal is
// refused while a network still has them, and release follows task shutdown
// rather than accompanying it.
const networkRemoveBudget = 30 * time.Second

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

// RemoveStackNetworks removes networks labelled with the stack namespace, and
// names the ones it could not remove.
//
// An overlay keeps its endpoints for a moment after the tasks on it stop, and
// Docker refuses to remove a network that still has them, so removal is retried
// rather than attempted once. What is still there at the end is returned instead
// of dropped: a network that outlives its teardown ends up in the local store
// without the swarm knowing about it, and then reports "not found" both to a
// later remove and to any service created on it — while continuing to appear in
// docker network ls.
func RemoveStackNetworks(ctx context.Context, apiClient *client.Client, stackName string) (removed int, stuck []string, err error) {
	return RemoveStackNetworksIn(ctx, apiClient, stackName, networkRemoveBudget)
}

// RemoveStackNetworksIn is RemoveStackNetworks with the wait budget supplied, so
// a test sets its own rather than waiting one out.
func RemoveStackNetworksIn(ctx context.Context, apiClient *client.Client, stackName string, budget time.Duration) (removed int, stuck []string, err error) {
	if stackName == "" {
		stackName = ResolveStackName()
	}
	nets, err := apiClient.NetworkList(ctx, client.NetworkListOptions{Filters: StackNamespaceFilter(stackName)})
	if err != nil {
		return 0, nil, fmt.Errorf("list stack networks: %w", err)
	}

	pending := nets.Items
	lastErr := map[string]error{}
	deadline := time.Now().Add(budget)
	for {
		var left []network.Summary
		for _, nw := range pending {
			if _, rmErr := apiClient.NetworkRemove(ctx, nw.ID, client.NetworkRemoveOptions{}); rmErr != nil {
				lastErr[nw.ID] = rmErr
				left = append(left, nw)
				continue
			}
			removed++
		}
		if len(left) == 0 {
			return removed, nil, nil
		}
		if time.Now().After(deadline) {
			for _, nw := range left {
				stuck = append(stuck, fmt.Sprintf("%s (%v)", nw.Name, lastErr[nw.ID]))
			}
			return removed, stuck, nil
		}
		select {
		case <-ctx.Done():
			return removed, nil, ctx.Err()
		case <-time.After(time.Second):
		}
		pending = left
	}
}

// WaitStackGone waits until no services and no tasks remain with the stack label.
//
// Services alone are not enough to wait on. Swarm deletes the service record
// before its tasks stop, so a teardown that only waits for the service list to
// empty goes on to remove networks whose endpoints are still held — which fails,
// and leaves the network behind.
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
		tasks, err := apiClient.TaskList(ctx, client.TaskListOptions{Filters: StackNamespaceFilter(stackName)})
		if err != nil {
			return fmt.Errorf("wait stack gone: %w", err)
		}
		if len(svcs.Items) == 0 && len(tasks.Items) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("stack %s still has %d service(s) and %d task(s) after %s",
				stackName, len(svcs.Items), len(tasks.Items), timeout)
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
