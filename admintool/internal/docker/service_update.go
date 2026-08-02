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
