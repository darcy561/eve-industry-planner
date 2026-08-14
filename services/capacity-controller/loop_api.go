package main

import (
	"context"
	"fmt"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/executor"
	"eve-industry-planner/capacity-controller/policy"
)

func apiLoop(ctx context.Context, swarm *cluster.Swarm, cfgHolder *configHolder) error {
	return serviceLoop(ctx, cluster.ServiceAPI, swarm, cfgHolder, applyAPI)
}

// applyAPI scales from plans linked to websocket client load (plain Scale).
func applyAPI(ctx context.Context, c cluster.Cluster, state cluster.State, plan policy.Plan) (int, error) {
	n := 0
	for _, a := range plan.Actions {
		switch a.Kind {
		case policy.KindScale:
			desired, err := executor.RequireDesired(a.Desired)
			if err != nil {
				return n, err
			}
			ok, err := executor.Scale(ctx, c, state, cluster.ServiceAPI, desired)
			if err != nil {
				return n, err
			}
			if ok {
				n++
			}
		case policy.KindWait:
			// no-op
		default:
			return n, fmt.Errorf("api apply: unsupported kind %q", a.Kind)
		}
	}
	return n, nil
}
