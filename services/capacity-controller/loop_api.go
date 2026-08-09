package main

import (
	"context"
	"fmt"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/policy"
)

func apiLoop(ctx context.Context, swarm *cluster.Swarm, cfgHolder *configHolder) error {
	return serviceLoop(ctx, cluster.ServiceAPI, swarm, cfgHolder, applyAPI)
}

// applyAPI is hold-only in v1 (no mutations).
func applyAPI(_ context.Context, _ cluster.Cluster, _ cluster.State, plan policy.Plan) (int, error) {
	for _, a := range plan.Actions {
		switch a.Kind {
		case policy.KindWait:
			// no-op
		default:
			return 0, fmt.Errorf("api apply: unsupported kind %q", a.Kind)
		}
	}
	return 0, nil
}
