package main

import (
	"context"
	"eve-industry-planner/shared/stackservices"
	"fmt"
	"os"
	"time"

	"eve-industry-planner/api/helper/sdecache"
	"eve-industry-planner/shared/container"
	natscore "eve-industry-planner/shared/core/nats"
	"eve-industry-planner/shared/lifecycle"
	"eve-industry-planner/shared/orchestrationprobes"
	"eve-industry-planner/shared/telemetry"
	"eve-industry-planner/shared/telemetry/apimetrics"
)

const shutdownTimeout = 5 * time.Second

type app struct {
	g        lifecycle.Group
	stopDeps func(context.Context)
	clients  *stackservices.Clients
	initErr  error
}

func (a *app) cleanups() []func(context.Context) {
	return lifecycle.AppThenDeps(a.g.Cleanups(), a.stopDeps)
}

func (a *app) cleanupIfFailed() {
	if a.initErr == nil {
		return
	}
	lifecycle.RunCleanups(shutdownTimeout, a.cleanups()...)
}

func (a *app) fail(err error) error {
	a.initErr = err
	return err
}

func (a *app) connectDeps(ctx context.Context) error {
	teleShutdown, err := telemetry.Init(ctx, telemetry.DefaultConfig("api"))
	if err != nil {
		return a.fail(err)
	}
	a.g.AddApp(func(c context.Context) { _ = teleShutdown(c) })

	clients, stopDeps, err := stackservices.Connect(ctx, stackservices.Services{
		Mongo: true, NATS: true, Redis: true, ObjectStore: true,
	})
	if err != nil {
		return a.fail(err)
	}
	a.clients = clients
	a.stopDeps = stopDeps
	return nil
}

func (a *app) registerMetrics(context.Context) error {
	apimetrics.RegisterSSORefreshDistinctGauges(a.clients.Redis)
	apimetrics.RegisterAuthSessionDistinctGauges(a.clients.Redis)
	return nil
}

func (a *app) startProbes(ctx context.Context) error {
	ready := func(c context.Context) error {
		if !sdecache.IsReady() {
			return fmt.Errorf("sde cache not ready")
		}
		if a.clients == nil || a.clients.Mongo == nil {
			return fmt.Errorf("mongo missing")
		}
		if err := a.clients.Mongo.Ping(c); err != nil {
			return fmt.Errorf("mongo: %w", err)
		}
		return nil
	}
	probes, err := orchestrationprobes.Start(ctx, ready, nil)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(probes)

	bus, err := orchestrationprobes.StartBus(ctx, orchestrationprobes.BusOptions{
		Role:       "api",
		InstanceID: container.ID(),
		Conn:       a.clients.NATS,
		Ready:      ready,
		Enabled:    true,
		Fill: func(st *natscore.HealthStatus) {
			if st != nil {
				st.AppVersion = os.Getenv("APP_VERSION")
			}
		},
	})
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(bus)
	return nil
}

func (a *app) startServer(ctx context.Context) error {
	apiRunner, err := StartAPIServer(ctx, a.clients)
	if err != nil {
		return a.fail(err)
	}
	a.g.Add(apiRunner)
	return nil
}
