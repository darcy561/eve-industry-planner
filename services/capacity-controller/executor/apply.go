// Package executor provides shared Cluster mutation helpers.
// Which kinds each service may apply is owned by the per-service loops in main.
package executor

import (
	"context"
	"fmt"

	"eve-industry-planner/capacity-controller/cluster"
)

// Scale updates desired replicas when the service is Managed in state.
// Returns whether a mutation ran.
func Scale(ctx context.Context, c cluster.Cluster, state cluster.State, svc cluster.Service, desired int) (bool, error) {
	ss, ok := state.Services[svc]
	if !ok || !ss.Managed {
		return false, nil
	}
	if err := c.Scale(ctx, svc, desired); err != nil {
		return false, err
	}
	return true, nil
}

// Cordon soft-stops a backend when the service is Managed in state.
func Cordon(ctx context.Context, c cluster.Cluster, state cluster.State, svc cluster.Service, containerID string) (bool, error) {
	ss, ok := state.Services[svc]
	if !ok || !ss.Managed {
		return false, nil
	}
	if err := c.Cordon(ctx, containerID); err != nil {
		return false, err
	}
	return true, nil
}

// Drain kicks clients on a backend when the service is Managed in state.
func Drain(ctx context.Context, c cluster.Cluster, state cluster.State, svc cluster.Service, containerID string) (bool, error) {
	ss, ok := state.Services[svc]
	if !ok || !ss.Managed {
		return false, nil
	}
	if err := c.Drain(ctx, containerID); err != nil {
		return false, err
	}
	return true, nil
}

// RequireDesired returns an error if desired is missing (scale actions).
func RequireDesired(desired *int) (int, error) {
	if desired == nil {
		return 0, fmt.Errorf("executor: scale missing desired")
	}
	return *desired, nil
}
