package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/core/redis/lease"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/logs"
	"eve-industry-planner/shared/orchestrationprobes"
)

func runServe(ctx context.Context) error {
	rt, cleanup, err := openRuntime(ctx, true)
	if err != nil {
		return err
	}
	defer cleanup()

	ready := func(c context.Context) error {
		if rt.clients.Redis == nil {
			return fmt.Errorf("redis nil")
		}
		if err := rt.clients.Redis.Ping(c).Err(); err != nil {
			return fmt.Errorf("redis: %w", err)
		}
		if rt.clients.NATS == nil || !rt.clients.NATS.IsConnected() {
			return fmt.Errorf("nats not connected")
		}
		if _, err := rt.cfgHolder.getOK(); err != nil {
			return err
		}
		return nil
	}

	var g lifecycle.Group
	probes, err := orchestrationprobes.Start(ctx, ready, nil)
	if err != nil {
		return err
	}
	g.Add(probes)

	bus, err := orchestrationprobes.StartBus(ctx, orchestrationprobes.BusOptions{
		Role:       "capacity-controller",
		InstanceID: container.ID(),
		Conn:       rt.clients.NATS,
		Ready:      ready,
		Enabled:    true,
		Fill: func(st *natscore.HealthStatus) {
			if st != nil {
				st.AppVersion = strings.TrimSpace(os.Getenv("APP_VERSION"))
			}
		},
	})
	if err != nil {
		return err
	}
	g.Add(bus)

	logs.InfoCtx(ctx, "capacity-controller starting",
		"policy_path", rt.policyPath,
		"lease", leaseKey,
		"docker_host", rt.dockerHost,
	)

	errCh := make(chan error, 1)
	go func() {
		errCh <- lease.RunWhileHeld(ctx, rt.clients.Redis, leaseKey, container.ID(), lease.Options{}, func(scoped context.Context) error {
			return runServiceLoops(scoped, rt.swarm, rt.cfgHolder)
		})
	}()

	select {
	case <-ctx.Done():
		lifecycle.RunCleanups(shutdownTimeout, g.Cleanups()...)
		return nil
	case err := <-errCh:
		lifecycle.RunCleanups(shutdownTimeout, g.Cleanups()...)
		return err
	}
}
