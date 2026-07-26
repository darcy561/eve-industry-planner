package docker

import (
	"context"
	"fmt"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
)

// ForceUpdateService triggers a rolling restart of a Swarm service (same image/spec).
// Equivalent to `docker service update --force` via the Engine SDK.
func ForceUpdateService(ctx context.Context, cli client.APIClient, nameOrID string) error {
	if nameOrID == "" {
		return fmt.Errorf("force update: empty service name")
	}
	svc, _, err := cli.ServiceInspectWithRaw(ctx, nameOrID, types.ServiceInspectOptions{})
	if err != nil {
		return fmt.Errorf("inspect %s: %w", nameOrID, err)
	}
	spec := svc.Spec
	spec.TaskTemplate.ForceUpdate++
	_, err = cli.ServiceUpdate(ctx, svc.ID, svc.Version, spec, types.ServiceUpdateOptions{})
	if err != nil {
		return fmt.Errorf("update %s: %w", nameOrID, err)
	}
	return nil
}
