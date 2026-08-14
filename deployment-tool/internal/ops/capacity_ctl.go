package ops

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/moby/moby/api/types/swarm"
	"github.com/moby/moby/client"

	"eve-industry-planner/deployment-tool/internal/docker"
	"eve-industry-planner/deployment-tool/internal/msg"
)

// CapacityCtlOpts configures eip capacity (Moby-exec into capacity-controller ctl).
type CapacityCtlOpts struct {
	Args []string // ctl subcommand args, e.g. status | evacuate <id>
}

// CapacityCtl runs `capacity-controller ctl …` on the running capacity-controller task.
// Overrides: EIP_CAPACITY_CONTAINER, EIP_CAPACITY_SERVICE, EIP_CAPACITY_WAIT_SEC, EIP_CAPACITY_POLL_SEC.
func CapacityCtl(ctx context.Context, opts CapacityCtlOpts) error {
	args := opts.Args
	if len(args) == 0 {
		return fmt.Errorf("capacity: need ctl args (status|plan|cordon|uncordon|drain|evacuate …)")
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(capacityWaitTimeout() + docker.DefaultClientTimeout))
	if err != nil {
		return fmt.Errorf("engine API client: %w", err)
	}
	defer apiClient.Close()

	ctr, err := resolveCapacityContainer(ctx, apiClient)
	if err != nil {
		return err
	}
	msg.Line("capacity-controller: " + ctr.display())

	cmd := append([]string{"capacity-controller", "ctl"}, args...)
	return execOneShot(ctx, apiClient, ctr.ID, cmd)
}

func capacityServiceName() string {
	if v := strings.TrimSpace(os.Getenv("EIP_CAPACITY_SERVICE")); v != "" {
		return v
	}
	return docker.ResolveStackName() + "_capacity-controller"
}

func capacityWaitTimeout() time.Duration {
	return envDurationSec("EIP_CAPACITY_WAIT_SEC", defaultCLIWaitSec)
}

func capacityPollInterval() time.Duration {
	return envDurationSec("EIP_CAPACITY_POLL_SEC", defaultCLIPollSec)
}

func resolveCapacityContainer(ctx context.Context, apiClient *client.Client) (coreContainer, error) {
	if override := strings.TrimSpace(os.Getenv("EIP_CAPACITY_CONTAINER")); override != "" {
		return coreContainer{ID: override, Name: override}, nil
	}

	service := capacityServiceName()
	if _, err := apiClient.ServiceInspect(ctx, service, client.ServiceInspectOptions{}); err != nil {
		return coreContainer{}, fmt.Errorf("capacity: service %q not found (is the stack deployed?): %w", service, err)
	}

	wait := capacityWaitTimeout()
	poll := capacityPollInterval()
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		state, _, _ := capacityUpdateState(ctx, apiClient, service)
		running, err := listRunningCore(ctx, apiClient, service)
		if err != nil {
			return coreContainer{}, err
		}
		n := len(running)
		if n == 1 && state != string(swarm.UpdateStateUpdating) {
			return running[0], nil
		}
		if n == 1 && state == string(swarm.UpdateStateUpdating) {
			// mid-roll: wait for single owner after update
		} else if n == 0 && state != string(swarm.UpdateStateUpdating) {
			return coreContainer{}, fmt.Errorf("capacity: no running %q containers", service)
		}

		select {
		case <-ctx.Done():
			return coreContainer{}, ctx.Err()
		case <-time.After(poll):
		}
	}

	state, _, _ := capacityUpdateState(ctx, apiClient, service)
	running, _ := listRunningCore(ctx, apiClient, service)
	return coreContainer{}, fmt.Errorf("capacity: timed out after %s waiting for capacity-controller (state=%s, running=%d)",
		wait, orNone(state), len(running))
}

func capacityUpdateState(ctx context.Context, apiClient *client.Client, service string) (state string, updating bool, err error) {
	insp, err := apiClient.ServiceInspect(ctx, service, client.ServiceInspectOptions{})
	if err != nil {
		return "", false, err
	}
	if insp.Service.UpdateStatus == nil {
		return "", false, nil
	}
	st := string(insp.Service.UpdateStatus.State)
	return st, st == string(swarm.UpdateStateUpdating), nil
}
