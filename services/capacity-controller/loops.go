package main

import (
	"context"
	"time"

	"golang.org/x/sync/errgroup"

	"eve-industry-planner/capacity-controller/cluster"
	"eve-industry-planner/capacity-controller/policy"
	"eve-industry-planner/shared/logs"
)

// applyFn is the per-service mutation vocabulary (owned by loop_*.go).
type applyFn func(context.Context, cluster.Cluster, cluster.State, policy.Plan) (int, error)

func runServiceLoops(ctx context.Context, swarm *cluster.Swarm, cfgHolder *configHolder) error {
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error { return workerLoop(gctx, swarm, cfgHolder) })
	g.Go(func() error { return websocketLoop(gctx, swarm, cfgHolder) })
	g.Go(func() error { return apiLoop(gctx, swarm, cfgHolder) })
	return g.Wait()
}

func serviceLoop(ctx context.Context, svc cluster.Service, swarm *cluster.Swarm, cfgHolder *configHolder, apply applyFn) error {
	tick := defaultTick
	for {
		if _, err := cfgHolder.getOK(); err != nil {
			logs.WarnCtx(ctx, "capacity-controller: policy unavailable",
				"service", svc, "error", err)
			if !sleepCtx(ctx, tick) {
				return ctx.Err()
			}
			continue
		}

		state, err := swarm.ObserveService(ctx, svc)
		if err != nil {
			logs.WarnCtx(ctx, "capacity-controller: observe failed",
				"service", svc, "error", err)
			if !sleepCtx(ctx, tick) {
				return ctx.Err()
			}
			continue
		}

		plan := policy.EvaluateService(svc, state, cfgHolder.get(), time.Now().UTC())
		logs.InfoCtx(ctx, "capacity-controller: plan",
			"service", svc,
			"summary", plan.Summary,
			"actions", len(plan.Actions),
		)

		n, err := apply(ctx, swarm, state, plan)
		if err != nil {
			logs.WarnCtx(ctx, "capacity-controller: apply failed",
				"service", svc, "error", err)
		} else if n > 0 {
			_ = swarm.RecordCooldown(ctx, svc, time.Now().UTC())
			logs.InfoCtx(ctx, "capacity-controller: applied",
				"service", svc, "mutations", n)
		}

		wait := max(plan.WaitAtLeast, tick)
		if !sleepCtx(ctx, wait) {
			return ctx.Err()
		}
	}
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
