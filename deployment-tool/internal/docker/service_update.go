package docker

import (
	"context"
	"fmt"

	"github.com/moby/moby/client"
)

// ForceUpdateService triggers a rolling restart of a Swarm service (same image/spec).
// Equivalent to `docker service update --force` via Moby ServiceUpdate.
func ForceUpdateService(ctx context.Context, apiClient *client.Client, nameOrID string) error {
	if nameOrID == "" {
		return fmt.Errorf("force update: empty service name")
	}
	result, err := apiClient.ServiceInspect(ctx, nameOrID, client.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("inspect %s: %w", nameOrID, err)
	}
	svc := result.Service
	spec := svc.Spec
	spec.TaskTemplate.ForceUpdate++
	_, err = apiClient.ServiceUpdate(ctx, svc.ID, client.ServiceUpdateOptions{Version: svc.Version, Spec: spec})
	if err != nil {
		return fmt.Errorf("update %s: %w", nameOrID, err)
	}
	return nil
}

// ServiceIdleStuck reports a replicated service that should have a task but Swarm
// has none running or starting (typical after stop-first: only Shutdown/Complete).
func ServiceIdleStuck(info ServiceInfo) bool {
	return info.Desired > 0 && info.Running == 0 && info.Starting == 0
}

// UnstickIdleService force-updates stack_short when it is present and idle-stuck.
// Returns true when a force-update was issued. Missing services are a no-op.
func UnstickIdleService(ctx context.Context, apiClient *client.Client, stackName, short string) (bool, error) {
	if short == "" {
		return false, fmt.Errorf("unstick: empty service name")
	}
	snap, err := LoadStackSnapshot(ctx, apiClient, stackName)
	if err != nil {
		return false, err
	}
	info, ok := snap.Services[short]
	if !ok || !ServiceIdleStuck(info) {
		return false, nil
	}
	if err := ForceUpdateService(ctx, apiClient, info.FullName); err != nil {
		return false, err
	}
	return true, nil
}
