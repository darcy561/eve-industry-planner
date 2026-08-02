package ops

import (
	"context"
	"fmt"
	"time"

	"github.com/moby/moby/client"

	"eve-industry-planner/admintool/internal/docker"
	"eve-industry-planner/admintool/internal/kit"
	"eve-industry-planner/admintool/internal/msg"
	"eve-industry-planner/admintool/internal/process"
)

// Shutdown stops the whole app: remove Swarm stack services/networks by
// com.docker.stack.namespace, then tear down leftover Compose project resources
// (containers + networks). Volumes and external networks (eip-core) are kept.
func Shutdown(ctx context.Context, yes bool) error {
	if !process.Confirm("Stop the app completely. Your data is kept. You will need eip up to start again.", yes) {
		return fmt.Errorf("shutdown: cancelled (pass -y to confirm)")
	}

	apiClient, err := docker.NewAPIClient(client.WithTimeout(5 * time.Minute))
	if err != nil {
		return err
	}
	defer apiClient.Close()

	stackName := docker.ResolveStackName()
	msg.Step("Stopping the app…")

	nSvc, err := docker.RemoveStackServices(ctx, apiClient, stackName)
	if err != nil {
		return err
	}
	if nSvc > 0 {
		msg.Step("  removed %d Swarm service(s) from stack %s", nSvc, stackName)
		if err := docker.WaitStackGone(ctx, apiClient, stackName, 2*time.Minute); err != nil {
			msg.Line("warning: " + err.Error())
		}
	} else {
		msg.Step("  no Swarm services for stack %s", stackName)
	}

	nNet, err := docker.RemoveStackNetworks(ctx, apiClient, stackName)
	if err != nil {
		return err
	}
	if nNet > 0 {
		msg.Step("  removed %d stack network(s)", nNet)
	}

	c, n, err := docker.RemoveComposeProject(ctx, apiClient, kit.ComposeProjectName)
	if err != nil {
		return err
	}
	if c > 0 || n > 0 {
		msg.Step("  removed leftover Compose: %d container(s), %d network(s)", c, n)
	}

	msg.Step("Done. Start again with: eip up")
	return nil
}
